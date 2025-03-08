import { customElement, property } from "lit/decorators.js";

import { CSSResultArray, TemplateResult, css, html, nothing } from "lit";
import { mdiArrowLeft, mdiArrowRight } from "@mdi/js";
import { ElecSankey } from "./elec-sankey";
import { HomeAssistant } from "./ha/types";
import { formatNumber } from "./ha/common/number/format_number";

import { fireEvent } from "./ha/common/dom/fire_event";


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

  protected _generateLabelDiv(
    id: string | undefined,
    icon: string | undefined,
    _name: string | undefined,
    valueA: number,
    valueB: number | undefined,
    valueAColor: string | undefined = undefined,
    valueBColor: string | undefined = undefined,
    displayClass: string | undefined = undefined,
  ): TemplateResult {
    const _id = id || "";
    const numFractionDigits = this.unit === "kWh" ? 1 : 0;
    console.log("displayClass: ", displayClass);
    return html`
      <div
        class="label ${id ? "label-action-clickable " : ""}${displayClass}"
        id=${_id}
        @click=${id ? this._handleMoreInfo : nothing}
      >${_name || nothing} ${icon
        ? html`<ha-svg-icon id=${_id} .path=${icon}> </ha-svg-icon>`
        : nothing}${valueB !== undefined
          ? html`<br /><span class="directionleft ${displayClass}" style=${
              valueBColor
              ? `color:${valueBColor}`
              : nothing} id=${_id}>
                <ha-svg-icon id=${_id} class="small" .path=${mdiArrowLeft}>
                </ha-svg-icon
                >${formatNumber(valueB, this.hass.locale, {
            maximumFractionDigits: numFractionDigits,
          })}&nbsp;${this.unit}</span
              ><br />
              <span class="directionright ${displayClass}" style=${valueAColor 
                ? `color:${valueAColor}` 
                : nothing} id=${_id}>
                <ha-svg-icon id=${_id} class="small" .path=${mdiArrowRight}>
                </ha-svg-icon
                >${formatNumber(valueA, this.hass.locale, {
            maximumFractionDigits: numFractionDigits,
          })}&nbsp;${this.unit}
              </span>`
          : html`<br />${formatNumber(valueA, this.hass.locale, {
            maximumFractionDigits: numFractionDigits,
          })}&nbsp;${this.unit}`}</div>`;
  }

  private _handleMoreInfo(e: MouseEvent) {
    const div = e.target as HTMLDivElement;
    fireEvent(this, "hass-more-info", {
      entityId: div.id,
    });
  }

  static styles: CSSResultArray = [
    ElecSankey.styles,
    css`
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

declare global {
  interface HTMLElementTagNameMap {
    "ha-elec-sankey": HaElecSankey;
  }
}
