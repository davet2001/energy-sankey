import { LovelaceCardConfig } from "./ha/data/lovelace/config/card";


export interface EnergyElecFlowCardConfig extends LovelaceCardConfig {
  title?: string;
  collection_key?: string;
}

export interface PowerFlowCardConfig extends LovelaceCardConfig {
  title?: string;
  power_from_grid_entity?: string;
  power_to_grid_entity?: string;
  generation_entity?: string;
  consumer_entities: {
    entity: string;
    name?: string;
  }[];
}

