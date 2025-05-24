import { customElement } from "lit/decorators.js";
import { HaElecSankey } from "./ha-elec-sankey";
import { svg, TemplateResult } from "lit";
import { ElecRoute, renderRect } from "./elec-sankey";

@customElement("ha-elec-sankey-extra")
export class HaElecSankeyExtra extends HaElecSankey {
  static extrasLength = 30;

  // Add your customizations here
  protected _insertExtras(
    _topLeftX: number,
    _topLeftY: number,
    _width: number,
    _color: string,
    _route: ElecRoute
  ): TemplateResult {
    const rect = renderRect(
      0,
      _topLeftY,
      this._getExtrasLength(),
      _width,
      "extra",
      _color
    );
    return svg`
      ${rect}
     `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-elec-sankey-extra": HaElecSankeyExtra;
  }
}
