import { mdiSolarPower } from "@mdi/js";
import { UnsubscribeFunc } from "home-assistant-js-websocket";
import { css, CSSResultArray, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";

//import "../../../../components/chart/ha-chart-base";
//import "../../../../components/ha-card";
import type {
  ElecConsumerRoute,
  ElecRoute,
  ElecRoutePair,
} from "../../elec-sankey";
import {
  BatterySourceTypeEnergyPreference,
  DeviceConsumptionEnergyPreference, /// done
  EnergyData,
  EnergySourceByType,
  energySourcesByType,
  getEnergyDataCollection,
  SolarSourceTypeEnergyPreference,
} from "../../ha/data/energy";
import {
  calculateStatisticsSumGrowth,
  getStatisticLabel,
} from "../../ha/data/recorder";
import { SubscribeMixin } from "../../ha/mixins/subscribe-mixin";
import { HomeAssistant } from "../../ha/types";
import type {
  LovelaceCard,
  LovelaceCardEditor,
} from "../../ha/panels/lovelace/types";
import { EnergyElecFlowCardConfig } from "../../types";

import { registerCustomCard } from "../../utils/custom-cards";
import {
  ENERGY_CARD_EDITOR_NAME,
  ENERGY_CARD_NAME,
  HIDE_CONSUMERS_BELOW_THRESHOLD_KWH,
} from "./const";
import { ElecFlowCardBase } from "../../shared/elec-flow-card-base";
import { setupCustomlocalize } from "../../localize";

const DEFAULT_CONFIG: EnergyElecFlowCardConfig = {
  type: `custom:${ENERGY_CARD_NAME}`,
  title: "Energy distribution today",
  config_version: 1,
  hide_small_consumers: false,
  max_consumer_branches: 0,
  battery_charge_only_from_generation: false,
};

export function verifyAndMigrateConfig(config: EnergyElecFlowCardConfig) {
  if (!config) {
    throw new Error("Invalid configuration");
  }
  let newConfig = { ...config };

  let currentVersion = config.config_version || 0;

  if (currentVersion === 0) {
    console.log("Migrating config from ? to version 1");
    currentVersion = 1;
    newConfig.type = `custom:${ENERGY_CARD_NAME}`;
  }
  newConfig.config_version = currentVersion;

  return newConfig;
}

export interface EnergyAllocation {
  fromGen: number;
  fromBatt: number;
  fromGrid: number;
}

registerCustomCard({
  type: ENERGY_CARD_NAME,
  name: "Sankey Energy Flow Card",
  description:
    "Card for showing the flow of electrical energy over a time period on a sankey chart",
});

@customElement(ENERGY_CARD_NAME)
export class EnergyElecFlowCard
  extends ElecFlowCardBase
  implements LovelaceCard
{
  @state() private _config?: EnergyElecFlowCardConfig;

  @state() private _gridInRoute?: ElecRoute;

  @state() private _gridOutRoute?: ElecRoute;

  @state() private _generationInRoutes: { [id: string]: ElecRoute } = {};

  @state() private _consumerRoutes: { [id: string]: ElecConsumerRoute } = {};

  @state() private _batteryRoutes: { [id: string]: ElecRoutePair } = {};

  protected hassSubscribeRequiredHostProps = ["_config"];

  public hassSubscribe(): UnsubscribeFunc[] {
    return [
      getEnergyDataCollection(this.hass, {
        key: this._config?.collection_key,
      }).subscribe((data) => this._getStatistics(data)),
    ];
  }

  public getCardSize(): Promise<number> | number {
    return 3;
  }

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./energy-elec-flow-card-editor");
    return document.createElement(
      ENERGY_CARD_EDITOR_NAME
    ) as LovelaceCardEditor;
  }

  public setConfig(config: EnergyElecFlowCardConfig): void {
    this._config = verifyAndMigrateConfig(config);
  }

  static getStubConfig(hass: HomeAssistant): EnergyElecFlowCardConfig {
    // We don't have access to instance localizer yet, so set up a temp one.
    const localize = setupCustomlocalize(hass);
    let config = DEFAULT_CONFIG;
    config.title = localize("card.energy_sankey.energy_distribution_today");

    return config;
  }

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }

    const maxConsumerBranches = this._config.max_consumer_branches || 0;
    const hideConsumersBelow = this._config.hide_small_consumers
      ? HIDE_CONSUMERS_BELOW_THRESHOLD_KWH
      : 0;
    const batteryChargeOnlyFromGeneration =
      this._config.battery_charge_only_from_generation || false;
    return html`
      <ha-card>
        ${this._config.title
          ? html`<h1 class="card-header">${this._config.title}</h1>`
          : ""}
        <div
          class="content ${classMap({
            "has-header": !!this._config.title,
          })}"
        >
          <ha-elec-sankey
            .hass=${this.hass}
            .gridInRoute=${this._gridInRoute || undefined}
            .gridOutRoute=${this._gridOutRoute || undefined}
            .generationInRoutes=${this._generationInRoutes || {}}
            .consumerRoutes=${this._consumerRoutes || {}}
            .batteryRoutes=${this._batteryRoutes || {}}
            .maxConsumerBranches=${maxConsumerBranches}
            .hideConsumersBelow=${hideConsumersBelow}
            .batteryChargeOnlyFromGeneration=${batteryChargeOnlyFromGeneration}
          ></ha-elec-sankey>
        </div>
      </ha-card>
    `;
  }

  private _getSourceEnergyAllocations(
    energyData: EnergyData,
    types: EnergySourceByType
  ): EnergyAllocation[] {
    let sourceEnergyAllocations: EnergyAllocation[] = [];

    const hasGrid =
      types.grid &&
      types.grid.length > 0 &&
      types.grid[0].flow_from &&
      types.grid[0].flow_from.length > 0
        ? 1
        : 0;
    const hasSolar = types.solar ? 1 : 0;
    const hasBattery = types.battery ? 1 : 0;
    const numSources = hasGrid + hasSolar + hasBattery;

    if (numSources < 2) {
      console.log(
        "Only",
        numSources,
        "energy sources defined. Skipping allocation analysis."
      );
      return [];
    }
    let count: number;
    if (hasGrid) {
      count =
        energyData.stats[types.grid![0].flow_from[0].stat_energy_from].length;
    } else if (hasSolar) {
      count = energyData.stats[types.solar![0].stat_energy_from].length;
    } else if (hasBattery) {
      count = energyData.stats[types.battery![0].stat_energy_from].length;
    } else {
      console.log(
        "Error preparing energy allocation analysis. Cannot get count."
      );
      return [];
    }

    for (let i = 0; i < count; i++) {
      let genEnergy = 0;
      let battEnergy = 0;
      let gridEnergy = 0;
      for (const source of energyData.prefs.energy_sources) {
        if (source.type === "solar") {
          const ref = source.stat_energy_from;
          genEnergy += energyData.stats[ref][i].change || 0;
          // @todo need to add other generation sources here (wind, etc.)
        } else if (source.type === "battery") {
          battEnergy +=
            energyData.stats[source.stat_energy_from][i].change || 0;
        } else if (source.type === "grid") {
          for (const grid_source of source.flow_from) {
            gridEnergy +=
              energyData.stats[grid_source.stat_energy_from][i].change || 0;
          }
        }
      }
      sourceEnergyAllocations.push({
        fromBatt: battEnergy,
        fromGen: genEnergy,
        fromGrid: gridEnergy,
      });
    }

    return sourceEnergyAllocations;
  }
  private async _getStatistics(energyData: EnergyData): Promise<void> {
    const types = energySourcesByType(energyData.prefs);
    const sourceEnergyAllocations = this._getSourceEnergyAllocations(
      energyData,
      types
    );

    let consumerEnergyAllocations: { [id: string]: EnergyAllocation[] } = {};

    const consumerList: string[] = [];

    const consumers: DeviceConsumptionEnergyPreference[] = energyData.prefs
      .device_consumption as DeviceConsumptionEnergyPreference[];

    // @todo this is duplicated code, could possibly be moved to optimise.
    // Filter out consumers that are higher level measurements in the hierarchy
    let consumerBlacklist: string[] = [];
    for (const consumer of consumers) {
      if (consumer.included_in_stat !== undefined) {
        consumerBlacklist.push(consumer.included_in_stat);
      }
    }
    for (const consumer of consumers) {
      if (consumerBlacklist.includes(consumer.stat_consumption)) {
        continue;
      }
      consumerList.push(consumer.stat_consumption);
      consumerEnergyAllocations[consumer.stat_consumption] = [];
    }
    // end of duplicated code

    for (let i = 0; i < sourceEnergyAllocations.length; i++) {
      const alloc = sourceEnergyAllocations[i];
      const total = alloc.fromBatt + alloc.fromGen + alloc.fromGrid;
      const ratioGen = total > 0 ? alloc.fromGen / total : 0;
      const ratioBatt = total > 0 ? alloc.fromBatt / total : 0;
      const ratioGrid = total > 0 ? alloc.fromGrid / total : 0;

      for (const consumer of consumerList) {
        if (energyData.stats[consumer].length <= i) {
          break;
        }
        const consumerEnergyChunk = energyData.stats[consumer][i].change || 0;
        consumerEnergyAllocations[consumer].push({
          fromGen: ratioGen * consumerEnergyChunk,
          fromBatt: ratioBatt * consumerEnergyChunk,
          fromGrid: ratioGrid * consumerEnergyChunk,
        });
      }
    }

    const solarSources: SolarSourceTypeEnergyPreference[] =
      energyData.prefs.energy_sources.filter(
        (source) => source.type === "solar"
      ) as SolarSourceTypeEnergyPreference[];

    if (types.grid && types.grid.length > 0) {
      if (types.grid[0].flow_from.length > 0) {
        const totalFromGrid =
          calculateStatisticsSumGrowth(
            energyData.stats,
            types.grid[0].flow_from.map((flow) => flow.stat_energy_from)
          ) ?? 0;
        const gridInId = types.grid[0].flow_from[0].stat_energy_from;
        this._gridInRoute = {
          id: gridInId,
          rate: totalFromGrid,
        };
      }
      if (types.grid[0].flow_to.length > 0) {
        const totalToGrid =
          calculateStatisticsSumGrowth(
            energyData.stats,
            types.grid[0].flow_to.map((flow) => flow.stat_energy_to)
          ) ?? 0;
        const gridOutId = types.grid[0].flow_to[0].stat_energy_to;
        this._gridOutRoute = {
          id: gridOutId,
          rate: totalToGrid,
        };
      }
    }

    solarSources.forEach((source) => {
      const label = getStatisticLabel(
        this.hass,
        source.stat_energy_from,
        undefined
      );

      const value = calculateStatisticsSumGrowth(energyData.stats, [
        source.stat_energy_from,
      ]);
      if (!(source.stat_energy_from in this._generationInRoutes)) {
        this._generationInRoutes[source.stat_energy_from] = {
          id: source.stat_energy_from,
          text: label,
          rate: value ?? 0,
          icon: mdiSolarPower,
        };
      } else {
        this._generationInRoutes[source.stat_energy_from].rate = value ?? 0;
      }
    });

    for (const consumer of consumers) {
      if (consumerBlacklist.includes(consumer.stat_consumption)) {
        continue;
      }
      const label =
        consumer.name ||
        getStatisticLabel(this.hass, consumer.stat_consumption, undefined);
      const value = calculateStatisticsSumGrowth(energyData.stats, [
        consumer.stat_consumption,
      ]);
      if (!(consumer.stat_consumption in this._consumerRoutes)) {
        const stat = consumerEnergyAllocations[consumer.stat_consumption];
        const mix = consumerEnergyAllocations[consumer.stat_consumption]
          ? {
              rateGrid: stat.reduce(
                (acc, curr) => acc + (curr.fromGrid > 0 ? curr.fromGrid : 0),
                0
              ),
              rateGeneration: stat.reduce(
                (acc, curr) => acc + (curr.fromGen > 0 ? curr.fromGen : 0),
                0
              ),
              rateBattery: stat.reduce(
                (acc, curr) => acc + (curr.fromBatt > 0 ? curr.fromBatt : 0),
                0
              ),
            }
          : undefined;
        this._consumerRoutes[consumer.stat_consumption] = {
          id: consumer.stat_consumption,
          text: label,
          rate: value ?? 0,
          icon: undefined,
          mix: mix,
        };
      } else {
        this._consumerRoutes[consumer.stat_consumption].rate = value ?? 0;
      }
    }

    const batteries: BatterySourceTypeEnergyPreference[] =
      energyData.prefs.energy_sources.filter(
        (source) => source.type === "battery"
      ) as BatterySourceTypeEnergyPreference[];

    batteries.forEach((battery) => {
      const label = getStatisticLabel(
        this.hass,
        battery.stat_energy_from,
        undefined
      );
      const inToSystem = calculateStatisticsSumGrowth(energyData.stats, [
        battery.stat_energy_from,
      ]);
      const outOfSystem = calculateStatisticsSumGrowth(energyData.stats, [
        battery.stat_energy_to,
      ]);
      this._batteryRoutes[battery.stat_energy_from] = {
        in: {
          id: battery.stat_energy_from,
          rate: inToSystem ?? 0,
        },
        out: {
          id: battery.stat_energy_to,
          rate: outOfSystem ?? 0,
        },
      };
    });
  }

  static styles: CSSResultArray = [
    css`
      ha-card {
        height: 100%;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        box-sizing: border-box;
        padding-bottom: 16px;
      }
      ha-elec-sankey {
        --generation-color: var(--energy-solar-color);
        --grid-in-color: var(--energy-grid-consumption-color);
        --batt-in-color: var(--energy-battery-out-color);
      }
    `,
  ];
}

// Legacy element name for backwards compatibility. Keep this until
// we are sure that noone is using pre config version 1 any more.
@customElement("hui-energy-elec-flow-card")
export class HuiEnergyElecFlowCard extends EnergyElecFlowCard {}
