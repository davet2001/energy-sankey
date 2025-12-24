import { LovelaceCardConfig } from "./ha/data/lovelace/config/card";

interface ElecFlowCardConfig extends LovelaceCardConfig {
  title?: string;
  hide_small_consumers?: boolean;
  battery_charge_only_from_generation?: boolean;
}

export interface EnergyElecFlowCardConfig extends ElecFlowCardConfig {
  collection_key?: string; // @todo this might not be needed.
}

interface ConsumerEntity {
  entity: string;
  name?: string;
}

interface BatteryEntity {
  entity: string;
  name?: string;
}

export interface PowerFlowCardConfig extends ElecFlowCardConfig {
  power_from_grid_entity?: string;
  power_to_grid_entity?: string;
  generation_entity?: string;
  independent_grid_in_out?: boolean;
  consumer_entities: ConsumerEntity[];
  battery_entities: BatteryEntity[];
}
