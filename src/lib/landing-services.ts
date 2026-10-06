// The services a Banda can offer on its Landing page: a fixed list, shown in
// Spanish.
export const LANDING_SERVICES = {
  wedding: "Bodas",
  corporate: "Eventos corporativos",
  private_party: "Fiestas privadas",
  birthday: "Cumpleaños",
  quinceanera: "Quinceañeras",
  festival: "Festivales",
  bar_restaurant: "Bares y restaurantes",
  graduation: "Graduaciones",
} as const;

export type LandingService = keyof typeof LANDING_SERVICES;

export const LANDING_SERVICE_IDS = Object.keys(LANDING_SERVICES) as LandingService[];

export const isLandingService = (value: string): value is LandingService =>
  Object.hasOwn(LANDING_SERVICES, value);
