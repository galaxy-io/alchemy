import { styled } from "@linaria/react";

// DLS CodeEditor has no fill-height mode; this stretches it and lets its scroller own overflow.
const FunctionCodeEditorFrame = styled.div`
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-height: 0;
  min-width: 0;

  & > * {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    min-height: 0;
  }

  & .cm-editor {
    height: 100%;
  }

  & .cm-scroller {
    overflow: auto;
  }
`;

export default FunctionCodeEditorFrame;
