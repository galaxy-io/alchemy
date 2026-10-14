import TextInput from "@galaxy-io/dls/inputs/TextInput";
import { FontFamily } from "@galaxy-io/dls/theme/enums";
import Widget from "@galaxy-io/dls/widget/Widget";

import {
  useCreateFunctionModalActions,
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";

const CreateFunctionModalRuntimeImage = () => {
  const { image } = useCreateFunctionModalState();
  const { setImage } = useCreateFunctionModalActions();

  return (
    <Widget header="Image">
      <TextInput
        label="Image reference"
        placeholder="ghcr.io/galaxy-io/enrich-company:1.4.0..."
        value={image}
        onChange={setImage}
        family={FontFamily.MONO}
        isRequired
        fillWidth
      />
    </Widget>
  );
};

export default CreateFunctionModalRuntimeImage;
