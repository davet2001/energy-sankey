import { LovelaceCardConfig } from "./ha/data/lovelace/config/card";

interface ElecFlowCardConfig extends LovelaceCardConfig {
  title?: string;
  hide_small_consumers?: boolean;
  battery_charge_only_from_generation?: boolean;
}

export interface EnergyElecFlowCardConfig extends ElecFlowCardConfig {
  collection_key?: string; // @todo this might not be needed.
}

export interface PowerFlowCardConfig extends ElecFlowCardConfig {
  power_from_grid_entity?: string;
  power_to_grid_entity?: string;
  generation_entity?: string;
  independent_grid_in_out?: boolean;
  hide_zero_consumers?: boolean;
  consumer_entities: {
    entity: string;
    name?: string;
  }[];
}
