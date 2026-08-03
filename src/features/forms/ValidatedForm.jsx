import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FORM_SCHEMAS } from "./schemas.js";

export default function ValidatedForm({ schema, defaultValues, children }) {
  const selectedSchema = FORM_SCHEMAS[schema];
  const form = useForm({
    resolver: zodResolver(selectedSchema),
    defaultValues
  });
  return children(form);
}
