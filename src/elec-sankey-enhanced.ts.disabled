/**
 * Enhanced sankey diagram with capability of overlaying rules.
 *
 */
import { TemplateResult, nothing, svg } from "lit";
import { customElement } from "lit/decorators";
import { mdiElectricSwitch, mdiElectricSwitchClosed } from "@mdi/js";

import { ElecRoute, ElecSankey, PAD_ANTIALIAS } from "./elec-sankey";

const RULE_ICON_SIZE = 30;
const RULE_ICON_COLOR = "#4b067c";

interface Rule {
  // id: string;
  state: boolean;
  // Future: add more things here like countdown etc.
}

/**
 * Renders an active rule as an SVG element at the specified coordinates.
 *
 * @param x - The x-coordinate of the centre of the rule graphic.
 * @param y - The y-coordinate of the centre of the rule graphic.
 * @returns A `TemplateResult` representing the SVG element.
 */
function renderActiveRule(
  x: number,
  y: number,
  switchState: boolean,
  size: number = RULE_ICON_SIZE
): TemplateResult {
  const SWITCH_SIZE = 80;
  const switchPath = switchState ? mdiElectricSwitchClosed : mdiElectricSwitch;
  return svg`
  <svg
      x="${x - size / 2}"
      y="${y - size / 2}"
      width="${size}"
      height="${size}"
      viewBox="0 0 100 100"
      >
      <rect ry="30" x="0" y="0" width="100" height="100" fill="${RULE_ICON_COLOR}" />
      <svg
        x="${50 - SWITCH_SIZE / 2}"
        y="${50 - SWITCH_SIZE / 2}"
        width="${SWITCH_SIZE}"
        height="${SWITCH_SIZE}"
        viewBox="0 0 24 24"
      >
        <path d="${switchPath}" />
        </svg>
    </svg>
`;
}

@customElement("elec-sankey-enhanced")
export class ElecSankeyEnhanced extends ElecSankey {
  protected _renderRule(
    topLeftX: number,
    topLeftY: number,
    width: number,
    color: string,
    rule: Rule
  ): [number, TemplateResult] {
    const length = RULE_ICON_SIZE * 2;
    const svgRule: TemplateResult = svg`
      <rect
        x="${topLeftX}" y="${topLeftY}"
        height="${width}" width="${length + PAD_ANTIALIAS}"
        style="fill:${color}"
      />
      ${
        rule
          ? renderActiveRule(
              topLeftX + RULE_ICON_SIZE,
              topLeftY + width / 2,
              rule.state
            )
          : nothing
      }
    `;
    return [length, svgRule];
  }

  protected _insertExtras(
    topLeftX: number,
    topLeftY: number,
    width: number,
    color: string,
    _: ElecRoute
  ): [number, TemplateResult] {
    const rule: Rule = {
      state: true,
    };
    return this._renderRule(topLeftX, topLeftY, width, color, rule);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "elec-sankey-enhanced": ElecSankeyEnhanced;
  }
}
