import { customElement, property, state } from "lit/decorators";

import { LovelaceCardEditor } from "../../ha/panels/lovelace/types";
import { EnergyElecFlowCardConfig, PowerFlowCardConfig } from "../../types";
import { html, LitElement, nothing } from "lit";
import { HomeAssistant, LocalizeFunc } from "../../ha/types";
import { HaFormSchema } from "../../utils/form/ha-form";
//import "../../ha/panels/lovelace/editor/hui-entities-card-row-editor";
import { fireEvent } from "../../ha/common/dom/fire_event";

import { ENERGY_CARD_EDITOR_NAME } from "./const";
import { GENERIC_LABELS } from "../../const";
import { mdiPalette } from "@mdi/js";
import setupCustomlocalize from "../../localize";

const ENERGY_LABELS = [
  "hide_small_consumers",
  "battery_charge_only_from_generation",
];
const schema = [
  { name: "title", selector: { text: {} } },

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
        name: "battery_charge_only_from_generation",
        selector: { boolean: {} },
      },
    ],
  },
];

@customElement(ENERGY_CARD_EDITOR_NAME)
export class EnergyFlowCardEditor
  extends LitElement
  implements LovelaceCardEditor
{
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _config?: EnergyElecFlowCardConfig;

  public setConfig(config: EnergyElecFlowCardConfig): void {
    this._config = config;
  }

  private _computeLabel = (schema: HaFormSchema) => {
    const customLocalize = setupCustomlocalize(this.hass!);

    if (GENERIC_LABELS.includes(schema.name)) {
      return customLocalize(`editor.card.generic.${schema.name}`);
    }
    if (ENERGY_LABELS.includes(schema.name)) {
      return customLocalize(`editor.card.energy_sankey.${schema.name}`);
    }
    return this.hass!.localize(
      `ui.panel.lovelace.editor.card.generic.${schema.name}`
    );
  };

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }

    const data = { ...this._config } as any;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${schema}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
      <ha-alert alert-type="info" .title="Note">
        Energy flow entities are configured in the
        <a href="/config/energy">Energy Dashboard Config</a>. They cannot be
        modified via the card configuration.
      </ha-alert>
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
    const config = ev.detail.value;
    fireEvent(this, "config-changed", { config });
  }
}
