import { customElement, property } from "lit/decorators.js";

import { CSSResultArray, TemplateResult, css, html, nothing } from "lit";
import { mdiArrowLeft, mdiArrowRight } from "@mdi/js";
import { ElecSankey } from "./elec-sankey";
import { HomeAssistant } from "./ha/types";
import { formatNumber } from "./ha/common/number/format_number";

import { fireEvent } from "./ha/common/dom/fire_event";
import { setupCustomlocalize } from "./localize";

// Additional items from frontend src/dialogs/more-info/ha-more-info-dialog.ts
type View = "info" | "history" | "settings" | "related";

export interface MoreInfoDialogParams {
  entityId: string | null;
  view?: View;
  /** @deprecated Use `view` instead */
  tab?: View;
}

declare global {
  // for fire event
  interface HASSDomEvents {
    "hass-more-info": MoreInfoDialogParams;
  }
}
// end of additional items from frontend src/dialogs/more-info/ha-more-info-dialog.ts

@customElement("ha-elec-sankey")
export class HaElecSankey extends ElecSankey {
  @property({ attribute: false }) public hass!: HomeAssistant;

  private _localizer: (key: string) => string = (key: string): string => {
    return key;
  };

  private _localizerIsSetup = false;

  protected _localize = (key: string): string => {
    if (!this._localizerIsSetup) {
      this._localizer = setupCustomlocalize(this.hass);
      this._localizerIsSetup = true;
    }
    // The low level card ElecSankey doesn't know anything about the card
    // prefix, so we need to add it here.
    if (!key.startsWith("card.")) {
      key = "card.generic." + key;
    }
    return this._localizer(key);
  };

  protected _generateLabelDiv(
    id: string | undefined,
    icon: string | undefined,
    _name: string | undefined,
    valueA: number,
    valueB: number | undefined,
    valueAColor: string | undefined = undefined,
    valueBColor: string | undefined = undefined,
    displayClass: string | undefined = undefined,
    showLeftValue: boolean = true
  ): TemplateResult {
    const _id = id || "";
    const numFractionDigits = this.unit === "kWh" ? 1 : 0;
    // prettier-ignore
    return html`<div
      class="label ${id ? "label-action-clickable " : ""}${displayClass}"
      id=${_id}
      @click=${id ? this._handleMoreInfo : nothing}
    >${_name || nothing}${icon
        ? html`<ha-svg-icon id=${_id} .path=${icon}> </ha-svg-icon>`
        : nothing}${valueB !== undefined
        ? html`<br />${showLeftValue ? html`<span
              class="directionleft ${displayClass}"
              style=${valueBColor ? `color:${valueBColor}` : nothing}
              id=${_id}
            >
              <ha-svg-icon id=${_id} class="small" .path=${mdiArrowLeft}>
              </ha-svg-icon
              >${formatNumber(valueB, this.hass.locale, {
                maximumFractionDigits: numFractionDigits,
              })}&nbsp;${this.unit}</span
            >`: nothing}<br />
            <span
              class="directionright ${displayClass}"
              style=${valueAColor ? `color:${valueAColor}` : nothing}
              id=${_id}
            >
              <ha-svg-icon id=${_id} class="small" .path=${mdiArrowRight}>
              </ha-svg-icon
              >${formatNumber(valueA, this.hass.locale, {
                maximumFractionDigits: numFractionDigits,
              })}&nbsp;${this.unit}
            </span>`
        : html`<br />${formatNumber(valueA, this.hass.locale, {
              maximumFractionDigits: numFractionDigits,
            })}&nbsp;${this.unit}`}
    </div>`;
  }

  private _handleMoreInfo(e: MouseEvent) {
    const div = e.target as HTMLDivElement;
    fireEvent(this, "hass-more-info", {
      entityId: div.id,
    });
  }

  static get styles(): CSSResultArray {
    return [
      super.styles,
      css`
        ha-card:focus {
          outline: none;
        }
        .card-header {
          padding-bottom: 0;
        }
        .name {
          text-align: center;
          line-height: initial;
          color: var(--primary-text-color);
          width: 100%;
          font-size: 15px;
          margin-top: 8px;
        }
        .label {
          font-size: 12px;
        }
        .label-action-clickable {
          cursor: pointer;
        }
        ha-svg-icon {
          --icon-primary-color: var(--icon-primary-color);
        }
        ha-svg-icon.small {
          --mdc-icon-size: 12px;
        }
        .directionright.grid {
          color: var(--energy-grid-consumption-color);
        }
        .directionleft.grid {
          color: var(--energy-grid-return-color);
        }
        .directionleft.battery {
          color: var(--energy-battery-out-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-elec-sankey": HaElecSankey;
  }
}
