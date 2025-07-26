import { HassEntity } from "home-assistant-js-websocket/dist/types";
import {
  css,
  html,
  LitElement,
  PropertyValues,
  nothing,
  CSSResultArray,
  TemplateResult,
} from "lit";
import { mdiSolarPower } from "@mdi/js";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { ElecRoute, ElecRoutePair } from "../../elec-sankey";
import { applyThemesOnElement } from "../../ha/common/dom/apply_themes_on_element";
import { computeStateName } from "../../ha/common/entity/compute_state_name";
import type { HomeAssistant } from "../../ha/types";
import { createEntityNotFoundWarning } from "../../ha/panels/lovelace/components/hui-warning";
import type {
  LovelaceCard,
  LovelaceCardEditor,
} from "../../ha/panels/lovelace/types";
import type { PowerFlowCardConfig } from "../../types";
import { hasConfigChanged } from "../../ha/panels/lovelace/common/has-changed";
import { registerCustomCard } from "../../utils/custom-cards";
import { getEnergyPreferences, EnergyPreferences } from "../../ha/data/energy";
import {
  ExtEntityRegistryEntry,
  getExtendedEntityRegistryEntry,
} from "../../ha/data/entity_registry";

import {
  POWER_CARD_NAME,
  POWER_CARD_EDITOR_NAME,
  HIDE_CONSUMERS_BELOW_THRESHOLD_W,
} from "./const";
import { ElecFlowCardBase } from "../../shared/elec-flow-card-base";
import setupCustomlocalize from "../../localize";

const DEFAULT_CONFIG: PowerFlowCardConfig = {
  type: `custom:${POWER_CARD_NAME}`,
  title: "Live power flow",
  config_version: 3,
  consumer_entities: [],
  battery_entities: [],
  generation_entity: undefined,
  power_from_grid_entity: undefined,
  power_to_grid_entity: undefined,
  invert_battery_flows: false,
  hide_small_consumers: false,
  max_consumer_branches: 0,
  independent_grid_in_out: false,
};

export function verifyAndMigrateConfig(config: PowerFlowCardConfig) {
  if (!config) {
    throw new Error("Invalid configuration");
  }
  let newConfig = { ...config };

  let currentVersion = config.config_version || 0;

  if (currentVersion === 0) {
    console.log("Migrating config from ? to version 1");
    currentVersion = 1;
    newConfig.battery_entities = newConfig.battery_entities || [];
    newConfig.hide_small_consumers = newConfig.hide_small_consumers || false;
    newConfig.max_consumer_branches = newConfig.max_consumer_branches || 0;
  }
  if (currentVersion === 1) {
    // Migrate from version 1 to version 2
    console.log("Migrating config from version 1 to version 2");
    currentVersion = 2;
    newConfig.invert_battery_flows = false;
  }
  if (currentVersion === 2) {
    // Migrate from version 2 to version 3
    console.log("Migrating config from version 2 to version 3");
    currentVersion = 3;
    newConfig.type = `custom:${POWER_CARD_NAME}`;
  }

  if (
    !config.power_from_grid_entity &&
    !config.power_to_grid_entity &&
    !config.generation_entity &&
    config.consumer_entities.length === 0
  ) {
    throw new Error("Must specify at least one entity");
  }
  newConfig.config_version = currentVersion;

  return newConfig;
}

registerCustomCard({
  type: POWER_CARD_NAME,
  name: "Sankey Power Flow Card",
  description: "Card for showing the instantaneous flow of electrical power",
});

function computePower(stateObj: HassEntity): number {
  /**
   * Returns the power of an entity, scaled to W.
   */
  let uom: string | undefined;
  let state: number = Number(stateObj.state);
  if ((uom = stateObj.attributes.unit_of_measurement)) {
    switch (uom) {
      case "kW": {
        return 1000 * state;
      }
      default: {
        return state;
      }
    }
  } else {
    return state;
  }
}

function htmlHuiWarning(hass: HomeAssistant, entity: string): TemplateResult {
  /**
   * Returns a not found warning for the given entity name.
   */
  return html`<hui-warning
    >${createEntityNotFoundWarning(hass, entity)}</hui-warning
  >`;
}

@customElement(POWER_CARD_NAME)
export class PowerFlowCard extends ElecFlowCardBase implements LovelaceCard {
  @state() protected _config?: PowerFlowCardConfig;

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./power-flow-card-editor");
    return document.createElement(POWER_CARD_EDITOR_NAME) as LovelaceCardEditor;
  }

  public getCardSize(): number {
    return 3;
  }

  public setConfig(config: PowerFlowCardConfig): void {
    const newConfig = verifyAndMigrateConfig(config);
    this._config = { ...newConfig };
  }

  private static async getExtendedEntityRegistryEntries(
    _hass: HomeAssistant
  ): Promise<{ [id: string]: ExtEntityRegistryEntry }> {
    // Get the full list of all extended entity registry entries as a dict.

    // @todo: uses multiple WS lookups - there's scope for optimising this.
    let extEntities: { [id: string]: ExtEntityRegistryEntry } = {};

    for (let key in _hass.entities) {
      const extEntity = await getExtendedEntityRegistryEntry(_hass, key);
      if (!extEntity) {
        continue;
      }
      extEntities[key] = extEntity;
    }
    return extEntities;
  }

  private static async getPowerEntityIdForEnergyEntityId(
    _hass: HomeAssistant,
    energyEntityId: string,
    extEntities: { [id: string]: ExtEntityRegistryEntry }
  ): Promise<string> {
    /**
     * Given an energy entity ID, find the associated power entity ID.
     * Looks up the device ID for the energy entity, then finds the most
     * likely power entity associated with that device.
     */
    const energyEntity = _hass.entities[energyEntityId];
    if (!energyEntity) {
      return "";
    }
    const deviceEntityId = energyEntity.device_id;
    if (!deviceEntityId) {
      return "";
    }
    const deviceEntity = _hass.devices[deviceEntityId];
    if (!deviceEntity) {
      return "";
    }
    let powerEntityIds: Array<string> = [];

    for (let key in extEntities) {
      const extEntity = extEntities[key];
      if (
        extEntity.device_id === deviceEntityId &&
        extEntity.original_device_class === "power"
      ) {
        powerEntityIds.push(extEntity.entity_id);
      }
    }

    if (powerEntityIds.length === 0) {
      return "";
    } else if (powerEntityIds.length === 1) {
      return powerEntityIds[0];
    } else {
      // We have multiple power entities for this device, pick the one
      // with the largest absolute power.
      let mostLikelyPowerEntityId: string = powerEntityIds[0];
      let maxPower: number = 0;
      for (let powerEntityId of powerEntityIds) {
        const power = Math.abs(+_hass.states[powerEntityId].state);
        if (power > maxPower) {
          mostLikelyPowerEntityId = powerEntityId;
        }
      }
      return mostLikelyPowerEntityId;
    }
  }

  private static async getPowerEntityIdForEnergyEntityIdWithFail(
    _hass: HomeAssistant,
    energyEntityId: string,
    extEntities: { [id: string]: ExtEntityRegistryEntry }
  ): Promise<string> {
    /**
     * Given an energy entity ID, find the associated power entity ID.
     * If not found, return a string indicating the failure.
     */
    let powerEntityId = await this.getPowerEntityIdForEnergyEntityId(
      _hass,
      energyEntityId,
      extEntities
    );
    if (!powerEntityId) {
      powerEntityId =
        "please_manually_enter_power_entity_id_for " + energyEntityId;
    }
    return powerEntityId;
  }

  public static async getStubConfig(
    _hass: HomeAssistant
  ): Promise<PowerFlowCardConfig> {
    /**
     * We go on a bit of a hunt to get the stub config.
     * HA configures *energy* sources, not power sources, so we look for the
     * original devices associated with each energy source, and find an
     * associated power sensor for each.
     * It's not perfect, but even a partially populated config is a huge
     * help to the user.
     */

    const energyPrefs: EnergyPreferences = await getEnergyPreferences(_hass);
    const extEntities: { [id: string]: ExtEntityRegistryEntry } =
      await this.getExtendedEntityRegistryEntries(_hass);

    // We don't have access to instance localizer here, so set up a temp one.
    const localize = setupCustomlocalize(_hass);
    let returnConfig: PowerFlowCardConfig = DEFAULT_CONFIG;
    returnConfig.title = localize("card.power_sankey.live_power_flow");
    // Parse energy sources from HA's energy prefs
    for (const source of energyPrefs.energy_sources) {
      switch (source.type) {
        case "grid":
          let power_from_grid_entity = "";
          power_from_grid_entity =
            await this.getPowerEntityIdForEnergyEntityIdWithFail(
              _hass,
              source.flow_from[0].stat_energy_from,
              extEntities
            );
          returnConfig.power_from_grid_entity = power_from_grid_entity;
          break;
        case "solar":
          let generation_entity = "";
          // In future we might support multiple generation entities
          generation_entity = await this.getPowerEntityIdForEnergyEntityId(
            _hass,
            source.stat_energy_from,
            extEntities
          );
          if (generation_entity) {
            returnConfig.generation_entity = generation_entity;
          }
          break;
        case "battery":
          let batteryEntity = "";
          batteryEntity = await this.getPowerEntityIdForEnergyEntityId(
            _hass,
            source.stat_energy_from,
            extEntities
          );
          if (batteryEntity) {
            returnConfig.battery_entities.push({ entity: batteryEntity });
          }
          break;
      }
    }

    // Filter out consumers that are higher level measurements in the hierarchy
    let consumerBlacklist: string[] = [];
    const consumers = energyPrefs.device_consumption;
    for (const consumer of consumers) {
      if (consumer.included_in_stat !== undefined) {
        consumerBlacklist.push(consumer.included_in_stat);
      }
    }

    // Parse energy consumers from HA's energy prefs
    for (const consumer of consumers) {
      if (consumerBlacklist.includes(consumer.stat_consumption)) {
        continue;
      }
      if (!returnConfig.consumer_entities) {
        returnConfig.consumer_entities = [];
      }
      const entityId = await this.getPowerEntityIdForEnergyEntityId(
        _hass,
        consumer.stat_consumption,
        extEntities
      );
      if (entityId) {
        returnConfig.consumer_entities.push({ entity: entityId });
      }
    }
    return returnConfig;
  }

  protected _getValues(
    config: PowerFlowCardConfig
  ):
    | [
        ElecRoute | null,
        ElecRoute | null,
        { [id: string]: ElecRoute },
        { [id: string]: ElecRoute },
        { [id: string]: ElecRoutePair },
      ]
    | TemplateResult {
    // The editor only supports a single generation entity, so we need to
    // convert the single entity to an array.
    if (config.generation_entity) {
      config.generation_entities = [config.generation_entity];
      delete config.generation_entity;
    }

    let gridInRoute: ElecRoute | null = null;
    if (config.power_from_grid_entity) {
      const stateObj = this.hass.states[config.power_from_grid_entity];
      if (!stateObj) {
        return html`
          <hui-warning>
            ${createEntityNotFoundWarning(
              this.hass,
              config.power_from_grid_entity
            )}
          </hui-warning>
        `;
      }
      const name = computeStateName(stateObj);
      gridInRoute = {
        id: config.power_from_grid_entity,
        text: name,
        rate: computePower(stateObj),
      };
    }

    let gridOutRoute: ElecRoute | null = null;
    if (config.independent_grid_in_out && config.power_to_grid_entity) {
      const stateObj = this.hass.states[config.power_to_grid_entity];
      if (!stateObj) {
        return htmlHuiWarning(this.hass, config.power_to_grid_entity);
      }
      gridOutRoute = {
        id: config.power_to_grid_entity,
        text: computeStateName(stateObj),
        rate: computePower(stateObj),
      };
    }

    const generationInRoutes: { [id: string]: ElecRoute } = {};
    for (const entity of [config.generation_entity]) {
      if (!entity) {
        continue;
      }
      const stateObj = this.hass.states[entity];
      if (!stateObj) {
        return htmlHuiWarning(this.hass, entity);
      }
      generationInRoutes[entity] = {
        id: entity,
        text: computeStateName(stateObj),
        rate: computePower(stateObj),
        icon: mdiSolarPower,
      };
    }

    const consumerRoutes: { [id: string]: ElecRoute } = {};
    if (config.consumer_entities) {
      for (const entity of config.consumer_entities) {
        let stateObj: HassEntity;
        stateObj = this.hass.states[entity.entity];
        if (!stateObj) {
          return htmlHuiWarning(this.hass, entity.entity);
        }
        let name = entity.name;
        if (!name) {
          name = computeStateName(stateObj);
        }
        consumerRoutes[entity.entity] = {
          id: entity.entity,
          text: name,
          rate: computePower(stateObj),
        };
      }
    }
    const batteryRoutes: { [id: string]: ElecRoutePair } = {};
    if (config.battery_entities) {
      for (const entity of config.battery_entities) {
        let stateObj: HassEntity;
        stateObj = this.hass.states[entity.entity];
        let name = entity.name;
        if (!stateObj) {
          return htmlHuiWarning(this.hass, entity.entity);
        }
        if (!name) {
          name = computeStateName(stateObj);
        }
        // power in refers to power into the energy distribution system
        // (i.e. out of the battery)
        let powerIn =
          (config.invert_battery_flows ? -1 : 1) * computePower(stateObj);
        batteryRoutes[entity.entity] = {
          in: {
            id: entity.entity,
            text: name,
            rate: powerIn > 0 ? powerIn : 0,
          },
          out: {
            id: "null",
            text: "null",
            rate: powerIn < 0 ? -powerIn : 0,
          },
        };
      }
    }
    return [
      gridInRoute,
      gridOutRoute,
      generationInRoutes,
      consumerRoutes,
      batteryRoutes,
    ];
  }

  protected render() {
    if (!this._config || !this.hass) {
      return nothing;
    }
    const config = this._config;
    const res = this._getValues(config);
    // If the result is an not an array, assume it is a error in the form of a
    // TemplateResult. Show it and stop.
    if (!Array.isArray(res)) {
      return res;
    }
    const [
      gridInRoute,
      gridOutRoute,
      generationInRoutes,
      consumerRoutes,
      batteryRoutes,
    ] = res;
    const maxConsumerBranches = this._config.max_consumer_branches || 0;
    const hideConsumersBelow = this._config.hide_small_consumers
      ? HIDE_CONSUMERS_BELOW_THRESHOLD_W
      : 0;
    const batteryChargeOnlyFromGeneration =
      this._config.battery_charge_only_from_generation || false;

    return html`
      <ha-card>
        ${config.title
          ? html`<h1 class="card-header">${config.title}</h1>`
          : ""}
        <div
          class="content ${classMap({
            "has-header": !!this._config.title,
          })}"
        >
          <ha-elec-sankey
            .hass=${this.hass}
            .unit=${"W"}
            .gridInRoute=${gridInRoute || undefined}
            .gridOutRoute=${gridOutRoute || undefined}
            .generationInRoutes=${generationInRoutes}
            .consumerRoutes=${consumerRoutes}
            .batteryRoutes=${batteryRoutes}
            .maxConsumerBranches=${maxConsumerBranches}
            .hideConsumersBelow=${hideConsumersBelow}
            .batteryChargeOnlyFromGeneration=${batteryChargeOnlyFromGeneration}
          ></ha-elec-sankey>
        </div>
      </ha-card>
    `;
  }

  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (hasConfigChanged(this, changedProps)) {
      return true;
    }

    if (!changedProps.has("hass")) {
      return false;
    }
    const oldHass = changedProps.get("hass") as HomeAssistant;
    const newHass = this.hass as HomeAssistant;

    if (this._config) {
      for (const id of [
        this._config.power_from_grid_entity,
        this._config.power_to_grid_entity,
        ...(this._config.generation_entities || []),
        ...(this._config.consumer_entities.map((a) => a.entity) || []),
        ...(this._config.battery_entities.map((a) => a.entity) || []),
      ]) {
        if (id) {
          const oldState = oldHass.states[id] as HassEntity | undefined;
          const newState = newHass.states[id] as HassEntity | undefined;
          if (oldState !== newState) {
            return true;
          }
        }
      }
    }
    return false;
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);
    if (!this._config || !this.hass) {
      return;
    }

    const oldHass = changedProps.get("hass") as HomeAssistant | undefined;
    const oldConfig = changedProps.get("_config") as
      | PowerFlowCardConfig
      | undefined;

    if (
      !oldHass ||
      !oldConfig ||
      oldHass.themes !== this.hass.themes ||
      oldConfig.theme !== this._config.theme
    ) {
      applyThemesOnElement(this, this.hass.themes, this._config.theme);
    }
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

// Legacy element name for backwards compatibility
// Can be dropped once we are sure noone is using config version 2 any more.
@customElement("hui-power-flow-card")
export class HuiPowerFlowCard extends PowerFlowCard {}
