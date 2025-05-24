import { customElement, property, state } from "lit/decorators";

import { LovelaceCardEditor } from "../../ha/panels/lovelace/types";
import { PowerFlowCardConfig } from "../../types";
import { html, LitElement, nothing } from "lit";
import { HomeAssistant, LocalizeFunc } from "../../ha/types";
import { HaFormSchema } from "../../utils/form/ha-form";
// import "./ha/panels/lovelace/editor/hui-entities-card-row-editor";
import memoizeOne from "memoize-one";
import { fireEvent, HASSDomEvent } from "../../ha/common/dom/fire_event";
import type {
  EditorTarget,
  EditDetailElementEvent,
  SubElementEditorConfig,
} from "../../ha/panels/lovelace/editor/types";

import { GENERIC_LABELS } from "../../const";
import { POWER_CARD_EDITOR_NAME } from "./const";
import {
  EntityConfig,
  LovelaceRowConfig,
} from "../../ha/panels/lovelace/entity-rows/types";
import { processEditorEntities } from "../../ha/panels/lovelace/editor/process-editor-entities";
import { mdiPalette, mdiWrench } from "@mdi/js";
import setupCustomlocalize from "../../localize";
import { verifyAndMigrateConfig } from "./hui-power-flow-card";

const POWER_LABELS = [
  "power_from_grid_entity",
  "power_to_grid_entity",
  "generation_entity",
  "hide_small_consumers",
  "invert_battery_flows",
  "battery_charge_only_from_generation",
  "independent_grid_in_out",
];

@customElement(POWER_CARD_EDITOR_NAME)
export class PowerFlowCardEditor
  extends LitElement
  implements LovelaceCardEditor
{
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _config?: PowerFlowCardConfig;

  @state() private _configConsumerEntities: EntityConfig[] = [];

  @state() private _configBatteryEntities: EntityConfig[] = [];

  @state() private _subElementEditorConfig?: SubElementEditorConfig;

  private _computeSchema(): Array<any> {
    const showSeparateToGridOption = this._config?.independent_grid_in_out;
    return [
      { name: "title", selector: { text: {} } },
      {
        name: "power_from_grid_entity",
        selector: {
          entity: {
            domain: "sensor",
            device_class: "power",
          },
        },
      },
      ...(showSeparateToGridOption
        ? [
            {
              name: "power_to_grid_entity",
              selector: {
                entity: {
                  domain: "sensor",
                  device_class: "power",
                },
              },
            },
          ]
        : []),
      {
        name: "generation_entity",
        selector: {
          entity: {
            domain: "sensor",
            device_class: "power",
          },
        },
      },
      {
        name: "appearance",
        flatten: true,
        type: "expandable",
        iconPath: mdiPalette,
        schema: [
          {
            name: "max_consumer_branches",
            selector: {
              number: {
                min: 0,
                max: 10,
                mode: "slider",
              },
            },
          },
          {
            name: "hide_small_consumers",
            selector: { boolean: {} },
          },
          {
            name: "invert_battery_flows",
            selector: { boolean: {} },
          },
          {
            name: "battery_charge_only_from_generation",
            selector: { boolean: {} },
          },
        ],
      },
      {
        name: "advanced_options",
        flatten: true,
        type: "expandable",
        iconPath: mdiWrench,
        schema: [
          {
            name: "independent_grid_in_out",
            selector: { boolean: {} },
          },
        ],
      },
    ];
  }

  public setConfig(config: PowerFlowCardConfig): void {
    this._config = verifyAndMigrateConfig(config);
    this._configBatteryEntities = processEditorEntities(
      this._config.battery_entities
    );
    this._configConsumerEntities = processEditorEntities(
      this._config.consumer_entities
    );
  }

  private _computeLabel = (schema: HaFormSchema) => {
    const customLocalize = setupCustomlocalize(this.hass!);

    if (GENERIC_LABELS.includes(schema.name)) {
      return customLocalize(`editor.card.generic.${schema.name}`);
    }
    if (POWER_LABELS.includes(schema.name)) {
      return customLocalize(`editor.card.power_sankey.${schema.name}`);
    }
    return this.hass!.localize(
      `ui.panel.lovelace.editor.card.generic.${schema.name}`
    );
  };

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }
    const customLocalize = setupCustomlocalize(this.hass!);
    // Unused feature - may be reinstated if we allow renaming sub-elements.
    //  if (this._subElementEditorConfig) {
    //   return html`
    //     <hui-sub-element-editor
    //       .hass=${this.hass}
    //       .config=${this._subElementEditorConfig}
    //       @go-back=${this._goBack}
    //       @config-changed=${this._handleSubElementChanged}
    //     >
    //     </hui-sub-element-editor>
    //   `;
    // }

    const data = { ...this._config } as any;

    const batteryHint = data.invert_battery_flows
      ? customLocalize(`editor.card.power_sankey.battery_hint_inverted`)
      : customLocalize(`editor.card.power_sankey.battery_hint_std`);
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${this._computeSchema()}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
      <elec-sankey-hui-entities-card-row-editor
        .hass=${this.hass}
        id="battery-entities"
        label="Battery Entities (Optional)"
        subLabel=${batteryHint}
        .entities=${this._configBatteryEntities}
        includeDeviceClasses=${["power"]}
        @entities-changed=${this._valueChanged}
      ></elec-sankey-hui-entities-card-row-editor>
      <elec-sankey-hui-entities-card-row-editor
        .hass=${this.hass}
        id="consumer-entities"
        label="Consumer Entities (Required)"
        .entities=${this._configConsumerEntities}
        includeDeviceClasses=${["power"]}
        @entities-changed=${this._valueChanged}
        @edit-detail-element=${this._editDetailElement}
      ></elec-sankey-hui-entities-card-row-editor>
      <ha-alert alert-type="info">
        Please note that this card is in development! If you see a bug or a
        possible improvement, please use the
        <a href="https://github.com/davet2001/energy-sankey/issues"
          >issue tracker</a
        >
        to help us improve it!
      </ha-alert>
    `;
  }

  private _valueChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    if (!this._config || !this.hass) {
      return;
    }

    const target = ev.target! as EditorTarget;
    let configValue = target.configValue || this._subElementEditorConfig?.type;
    let value =
      target.checked !== undefined
        ? target.checked
        : target.value || ev.detail.config || ev.detail.value;

    if (!configValue && value) {
      // A form value changed. We don't know which one.
      // Could be title or anything else in the schema.
      if (value.title !== this._config.title) {
        configValue = "title";
        value = value.title;
      }
      // else if (value.theme !== this._config.theme) {
      //   configValue = "theme";
      //   value = value.theme;
      // }
      else if (
        value.power_from_grid_entity !== this._config.power_from_grid_entity
      ) {
        configValue = "power_from_grid_entity";
        value = value.power_from_grid_entity;
      } else if (
        value.power_to_grid_entity !== this._config.power_to_grid_entity
      ) {
        configValue = "power_to_grid_entity";
        value = value.power_to_grid_entity;
      } else if (value.generation_entity !== this._config.generation_entity) {
        configValue = "generation_entity";
        value = value.generation_entity;
      } else if (
        value.max_consumer_branches != this._config.max_consumer_branches ||
        0
      ) {
        configValue = "max_consumer_branches";
        value = value.max_consumer_branches;
      } else if (
        value.hide_small_consumers != this._config.hide_small_consumers
      ) {
        configValue = "hide_small_consumers";
        value = value.hide_small_consumers;
      } else if (
        value.invert_battery_flows != this._config.invert_battery_flows
      ) {
        configValue = "invert_battery_flows";
        value = value.invert_battery_flows;
      } else if (
        value.battery_charge_only_from_generation !=
        this._config.battery_charge_only_from_generation
      ) {
        configValue = "battery_charge_only_from_generation";
        value = value.battery_charge_only_from_generation;
      } else if (
        value.independent_grid_in_out != this._config.independent_grid_in_out
      ) {
        configValue = "independent_grid_in_out";
        value = value.independent_grid_in_out;
      } else {
        console.warn("unhandled change in <ha-form>");
      }
    }

    if (configValue === "row" || (ev.detail && ev.detail.entities)) {
      const newConfigEntities =
        ev.detail.entities || this._configConsumerEntities!.concat();
      if (configValue === "row") {
        if (!value) {
          newConfigEntities.splice(this._subElementEditorConfig!.index!, 1);
          this._goBack();
        } else {
          newConfigEntities[this._subElementEditorConfig!.index!] = value;
        }

        this._subElementEditorConfig!.elementConfig = value;
      }
      if (
        ev.currentTarget &&
        (ev.currentTarget as any).id === "consumer-entities"
      ) {
        this._config = {
          ...this._config!,
          consumer_entities: newConfigEntities,
        };
        this._configConsumerEntities = processEditorEntities(
          this._config!.consumer_entities
        );
      } else if (
        ev.currentTarget &&
        (ev.currentTarget as any).id === "battery-entities"
      ) {
        this._config = {
          ...this._config!,
          battery_entities: newConfigEntities,
        };
        this._configBatteryEntities = processEditorEntities(
          this._config!.battery_entities
        );
      }
    } else if (configValue) {
      if (value === "") {
        this._config = { ...this._config };
        delete this._config[configValue!];
      } else {
        this._config = {
          ...this._config,
          [configValue]: value,
        };
      }
    }
    fireEvent(this, "config-changed", { config: this._config });
  }

  // Unused function which may be reinstated if we allow renaming sub-elements.
  //  private _handleSubElementChanged(ev: CustomEvent): void {
  //   ev.stopPropagation();
  //   if (!this._config || !this.hass) {
  //     return;
  //   }

  //   const configValue = this._subElementEditorConfig?.type;
  //   const value = ev.detail.config;

  //   if (configValue === "row") {
  //     const newConfigEntities = this._configConsumerEntities!.concat();
  //     if (!value) {
  //       newConfigEntities.splice(this._subElementEditorConfig!.index!, 1);
  //       this._goBack();
  //     } else {
  //       newConfigEntities[this._subElementEditorConfig!.index!] = value;
  //     }

  //     this._config = { ...this._config!, entities: newConfigEntities };
  //     this._configConsumerEntities = processEditorEntities(this._config!.entities);
  //   } else if (configValue) {
  //     if (value === "") {
  //       this._config = { ...this._config };
  //       delete this._config[configValue!];
  //     } else {
  //       this._config = {
  //         ...this._config,
  //         [configValue]: value,
  //       };
  //     }
  //   }

  //   this._subElementEditorConfig = {
  //     ...this._subElementEditorConfig!,
  //     elementConfig: value,
  //   };

  //   fireEvent(this, "config-changed", { config: this._config });
  // }

  private _editDetailElement(ev: HASSDomEvent<EditDetailElementEvent>): void {
    this._subElementEditorConfig = ev.detail.subElementConfig;
  }

  private _goBack(): void {
    this._subElementEditorConfig = undefined;
  }
}
