import { LitElement } from "lit";
import { SubscribeMixin } from "../ha/mixins/subscribe-mixin";
import { setupCustomlocalize } from "../localize";
import { property } from "lit/decorators";
import { HomeAssistant } from "../ha/types";

export class ElecFlowCardBase extends SubscribeMixin(LitElement) {
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
    console.info("[ElecFlowCardBase] Localizing key:", key);
    return this._localizer(key);
  };
}
