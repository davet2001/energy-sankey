import { HassEntity } from "home-assistant-js-websocket/dist/types";
import {
  css,
  html,
  LitElement,
  PropertyValues,
  nothing,
  CSSResultArray,
} from "lit";
import { mdiSolarPower } from "@mdi/js";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { ElecRoute } from "./elec-sankey";
import { applyThemesOnElement } from "./ha/common/dom/apply_themes_on_element";
import { computeStateName } from "./ha/common/entity/compute_state_name";
import { isValidEntityId } from "./ha/common/entity/valid_entity_id";
import type { HomeAssistant } from "./ha/types";
import { createEntityNotFoundWarning } from "./ha/panels/lovelace/components/hui-warning";
import type { LovelaceCard, LovelaceCardEditor } from "./ha/panels/lovelace/types";
import type { PowerFlowCardConfig } from "./types";
import { hasConfigChanged } from "./ha/panels/lovelace/common/has-changed";
import { registerCustomCard } from "./utils/custom-cards";
import { getEnergyPreferences } from "./ha/data/energy";
import { ExtEntityRegistryEntry, getExtendedEntityRegistryEntry } from "./ha/data/entity_registry";
//import "./power-flow-card-editor"


import { POWER_CARD_NAME, POWER_CARD_EDITOR_NAME } from "./const";

registerCustomCard({
  type: "hui-power-flow-card",
  name: "Sankey Power Flow Card",
  description: "Card for showing the instantaneous flow of electrical power",
});


@customElement("hui-power-flow-card")
class HuiPowerFlowCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _config?: PowerFlowCardConfig;

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./power-flow-card-editor");
    return document.createElement(
      POWER_CARD_EDITOR_NAME
    ) as LovelaceCardEditor;
  }

  public getCardSize(): number {
    return 3;
  }

  public setConfig(config: PowerFlowCardConfig): void {
    if (
      !config.power_from_grid_entity &&
      !config.power_to_grid_entity &&
      !config.generation_entities &&
      !config.consumer_entities
    ) {
      throw new Error("Must specify at least one entity");
    }
    if (config.power_from_grid_entity) {
      if (!isValidEntityId(config.power_from_grid_entity)) {
        throw new Error("Invalid power from grid entity specified");
      }
      // @todo consider adding more config checks here.
      this._config = { ...config };
    }
  }

  private static async getExtendedEntityRegistryEntries(_hass: HomeAssistant): Promise<{ [id: string]: ExtEntityRegistryEntry }> {
    // Get the full list of all extended entity registry entries as a dict.

    // @todo: uses multiple WS lookups - there's scope for optimising this.
    let extEntities: { [id: string]: ExtEntityRegistryEntry; } = {};

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
    extEntities: { [id: string]: ExtEntityRegistryEntry; },
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
      if (extEntity.device_id === deviceEntityId && extEntity.original_device_class === "power") {
        powerEntityIds.push(extEntity.entity_id);
      }
    }

    if (powerEntityIds.length === 0) {
      return "";
    }
    else if (powerEntityIds.length === 1) {
      return powerEntityIds[0];
    }
    else {
      // We have multiple power entities for this device, pick the one
      // with the largest absolute power.
      let mostLikelyPowerEntityId: string = powerEntityIds[0];
      let maxPower: number = 0;
      for (let powerEntityId of powerEntityIds) {
        const power = Math.abs(+_hass.states[powerEntityId].state);
        if (power > maxPower) {
          mostLikelyPowerEntityId = powerEntityId;
        };
      }
      return mostLikelyPowerEntityId;
    }
  }

  private static async getPowerEntityIdForEnergyEntityIdWithFail(
    _hass: HomeAssistant,
    energyEntityId: string,
    extEntities: { [id: string]: ExtEntityRegistryEntry; },
  ): Promise<string> {
    /**
     * Given an energy entity ID, find the associated power entity ID.
     * If not found, return a string indicating the failure.
     */
    let powerEntityId = await this.getPowerEntityIdForEnergyEntityId(_hass, energyEntityId, extEntities);
    if (!powerEntityId) {
      powerEntityId = "please_manually_enter_power_entity_id_for " + energyEntityId;
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
     * It's not perfect, but even if a partially populated config is a huge
     * help to the user.
     */

    const energyPrefs = await getEnergyPreferences(_hass);
    const extEntities: { [id: string]: ExtEntityRegistryEntry; }
      = await this.getExtendedEntityRegistryEntries(_hass);

    let returnConfig: PowerFlowCardConfig = {
      type: "custom:hui-power-flow-card",
      title: "Live power flow",
      consumer_entities: [],
    }
    // Parse energy sources from HA's energy prefs
    for (const source of energyPrefs.energy_sources) {
      switch (source.type) {
        case "grid":
          returnConfig.power_from_grid_entity = await this.getPowerEntityIdForEnergyEntityIdWithFail(_hass, source.flow_from[0].stat_energy_from, extEntities);
          break;
        case "solar":
          if (!returnConfig.generation_entities) {
            returnConfig.generation_entities = [];
          }
          returnConfig.generation_entities.push(
            await this.getPowerEntityIdForEnergyEntityIdWithFail(
              _hass,
              source.stat_energy_from,
              extEntities
            )
          );
          break;
      }
    };
    // Parse energy consumers from HA's energy prefs
    for (const consumer of energyPrefs.device_consumption) {
      if (!returnConfig.consumer_entities) {
        returnConfig.consumer_entities = [];
      }
      const entityId = await this.getPowerEntityIdForEnergyEntityIdWithFail(
        _hass,
        consumer.stat_consumption,
        extEntities
      )
      returnConfig.consumer_entities.push({ entity: entityId });
    };
    return returnConfig;
  }

  protected render() {
    if (!this._config || !this.hass) {
      return nothing;
    }
    let gridInRoute: ElecRoute | null = null;
    if (this._config.power_from_grid_entity) {
      console.log("power_from_grid_entity: '", this._config.power_from_grid_entity, "'");
      const stateObj = this.hass.states[this._config.power_from_grid_entity];
      if (!stateObj) {
        console.log("power_from_grid_entity not found");
        return html`
          <hui-warning>
            ${createEntityNotFoundWarning(
          this.hass,
          this._config.power_from_grid_entity
        )}
          </hui-warning>
        `;
      }
      const name = computeStateName(stateObj);
      gridInRoute = {
        id: this._config.power_from_grid_entity,
        text: name,
        rate: Number(stateObj.state),
      };
    }

    let gridOutRoute: ElecRoute | null = null;
    if (this._config.power_to_grid_entity) {
      const stateObj = this.hass.states[this._config.power_to_grid_entity];
      if (!stateObj) {
        console.log("power_to_grid_entity not found");
        return html`
          <hui-warning>
            ${createEntityNotFoundWarning(
          this.hass,
          this._config.power_to_grid_entity
        )}
          </hui-warning>
        `;
      }
      const name = computeStateName(stateObj);
      gridOutRoute = {
        id: this._config.power_to_grid_entity,
        text: name,
        rate: Number(stateObj.state),
      };
    }

    const generationInRoutes: { [id: string]: ElecRoute } = {};
    if (this._config.generation_entities) {
      for (const entity of this._config.generation_entities) {
        const stateObj = this.hass.states[entity];
        if (!stateObj) {
          console.log("generation entity '", entity, "' not found");
          return html`
            <hui-warning>
              ${createEntityNotFoundWarning(this.hass, entity)}
            </hui-warning>
          `;
        }
        const name = computeStateName(stateObj);
        generationInRoutes[entity] = {
          id: entity,
          text: name,
          rate: Number(stateObj.state),
          icon: mdiSolarPower,
        };
      }
    }

    const consumerRoutes: { [id: string]: ElecRoute } = {};
    if (this._config.consumer_entities) {
      for (const entity of this._config.consumer_entities) {
        let stateObj: HassEntity;
        stateObj = this.hass.states[entity.entity];
        let name = entity.name;
        if (!stateObj) {
          console.log("consumer entity '", entity, "' not found");
          return html`
            <hui-warning>
              ${createEntityNotFoundWarning(this.hass, entity.entity)}
            </hui-warning>
          `;
        }
        if (!name) {
          name = computeStateName(stateObj);
        }
        consumerRoutes[entity.entity] = {
          id: entity.entity,
          text: name,
          rate: Number(stateObj.state),
        };
      }
    }
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
            .unit=${"W"}
            .gridInRoute=${gridInRoute || undefined}
            .gridOutRoute=${gridOutRoute || undefined}
            .generationInRoutes=${generationInRoutes}
            .consumerRoutes=${consumerRoutes}
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
        ...(this._config.consumer_entities.map(a => a.entity) || []),
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
        padding: 16px;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        box-sizing: border-box;
      }
      ha-card:focus {
        outline: none;
      }
      ha-elec-sankey {
        --generation-color: var(--energy-solar-color);
        --grid-in-color: var(--energy-grid-consumption-color);
      }
      .name {
        text-align: center;
        line-height: initial;
        color: var(--primary-text-color);
        width: 100%;
        font-size: 15px;
        margin-top: 8px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-power-flow-card": HuiPowerFlowCard;
  }
}
