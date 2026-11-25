// Order matches the model's class indices.
export const CLASS_NAMES = ["with_helmet", "without_helmet", "rider", "plate"] as const;
export type ClassName = (typeof CLASS_NAMES)[number];

export const CLASS_LABELS: Record<ClassName, string> = {
  with_helmet: "Helmet",
  without_helmet: "No helmet",
  rider: "Rider",
  plate: "Number plate",
};

export interface Detection {
  /** box in original image pixels */
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
  cls: ClassName;
}

export interface Letterbox {
  size: number;   // model input side, 640
  scale: number;  // original -> model
  padX: number;
  padY: number;
}
