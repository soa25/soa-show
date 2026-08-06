// Sculpture type used by the server page + client carousel.
// stone and price are optional — leave blank until confirmed.
export interface Sculpture {
  id: number;
  title: string;
  sculptor: string;
  stone?: string;
  price?: number;
  dimensions?: string;
  image?: string;
}
