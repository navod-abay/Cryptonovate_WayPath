import { Carrot, GameController, Snowflake, TShirt, Truck, Van, type Icon } from '@phosphor-icons/react';
import type { OrderType, StoreType } from '@/types';

/**
 * Everything the UI needs to know about an order category, in one place.
 * Tile colours and icons come from the Figma "Condition" component
 * (freeze / dry / tech / style); the icon colour is the dark blue used on the store manager screens.
 */
export interface CategoryMeta {
  /** Card / list label, e.g. "Chilled Order". */
  label: string;
  /** Page heading, e.g. "Chilled order". */
  orderTitle: string;
  /** Short adjective for sentences: "Chilled order due for Monday". */
  short: string;
  /** Word used on buttons: "Place Dry Order". */
  buttonName: string;
  icon: Icon;
  /** Icon tile background, and a lighter one for pending / not-confirmed. */
  tile: string;
  tileFaded: string;
  /** Background of the "today" delivery card. */
  cardBg: string;
  vehicleIcon: Icon;
  /** Letter used in mock order ids. */
  code: string;
}

export const CATEGORY: Record<OrderType, CategoryMeta> = {
  chilled: {
    label: 'Chilled Order', orderTitle: 'Chilled order', short: 'Chilled', buttonName: 'Chilled',
    icon: Snowflake, tile: '#80DEF6', tileFaded: '#CCF2FB', cardBg: '#CCF2FB', vehicleIcon: Van, code: 'C',
  },
  dry: {
    label: 'Dry Groceries', orderTitle: 'Dry groceries order', short: 'Dry grocery', buttonName: 'Dry',
    icon: Carrot, tile: '#FDE68A', tileFaded: '#FEF3C7', cardBg: '#FFFBEB', vehicleIcon: Truck, code: 'D',
  },
  tech: {
    label: 'Tech Order', orderTitle: 'Tech order', short: 'Tech', buttonName: 'Tech',
    icon: GameController, tile: '#BBF7D0', tileFaded: '#DCFCE7', cardBg: '#F0FDF4', vehicleIcon: Truck, code: 'T',
  },
  style: {
    label: 'Style Order', orderTitle: 'Style order', short: 'Style', buttonName: 'Style',
    icon: TShirt, tile: '#FFC2CA', tileFaded: '#FFE0E4', cardBg: '#FFF5F6', vehicleIcon: Truck, code: 'S',
  },
};

/** Dark blue used for the icon glyph inside every category tile (Figma #2B6184). */
export const CATEGORY_ICON_COLOR = '#2B6184';

export const STORE_TYPE_LABEL: Record<StoreType, string> = {
  grocery: 'Grocery store',
  tech: 'Tech store',
  style: 'Style store',
};
