import { styled } from "@linaria/react";

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
