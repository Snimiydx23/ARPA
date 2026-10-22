// ARPA — lets python code blocks inside an answer ask the chat to run them (Run button).
import * as React from "react";

export type CodeRunApi = { run: (code: string) => void; running: boolean };
export const CodeRunContext = React.createContext<CodeRunApi | null>(null);
export const useCodeRun = () => React.useContext(CodeRunContext);
