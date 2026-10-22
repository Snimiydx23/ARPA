// ARPA — lets deep components (code blocks inside answers) open the canvas without prop drilling.
import * as React from "react";

export type OpenCanvas = (o: { content: string; kind: "doc" | "code"; language?: string; title?: string }) => void;
export const CanvasContext = React.createContext<OpenCanvas | null>(null);
export const useOpenCanvas = () => React.useContext(CanvasContext);
