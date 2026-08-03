import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2, X } from "lucide-react";
import { formatMajorAmount, parseMoneyValue, SUPPORTED_CURRENCIES } from "../../lib/money.js";

const EXPENSE_FORM_SCHEMA = z
  .object({
    title: z.string().trim().min(1, "Add a title for this expense."),
    amountInput: z.string().trim().min(1, "Enter a real amount."),
    currency: z.string().min(1, "Choose a currency."),
    paidByTravelerClientId: z.string().min(1, "Choose who paid."),
    expenseDate: z.string().optional().default(""),
    participantTravelerClientIds: z.array(z.string()).min(1, "Choose at least one person to split with."),
    notes: z.string().optional().default("")
  })
  .superRefine((value, context) => {
    if (!parseMoneyValue(`${value.currency} ${value.amountInput}`, value.currency)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amountInput"],
        message: "Enter a real amount."
      });
    }
  });

function DialogHeader({ title, onClose }) {
  return (
    <div className="dialog-header">
      <h2>{title}</h2>
      <button className="icon-button" type="button" aria-label="Close dialog" data-dialog-close onClick={onClose}>
        <X size={18} />
      </button>
    </div>
  );
}

function ExpenseModal({ mode, expense, travelers, onCancel, onSave, onDelete }) {
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const {
    formState: { errors, isDirty, isValid },
    handleSubmit: submitExpenseForm,
    register,
    setValue,
    watch
  } = useForm({
    resolver: zodResolver(EXPENSE_FORM_SCHEMA),
    mode: "onChange",
    defaultValues: {
      title: expense.title ?? "",
      amountInput: expense.amountMinor ? formatMajorAmount(expense.amountMinor, expense.currency) : "",
      currency: expense.currency ?? SUPPORTED_CURRENCIES[0],
      paidByTravelerClientId: expense.paidByTravelerClientId ?? travelers[0]?.clientId ?? "",
      expenseDate: expense.expenseDate ?? "",
      participantTravelerClientIds: expense.participantTravelerClientIds ?? [],
      notes: expense.notes ?? ""
    }
  });
  const participantTravelerClientIds = watch("participantTravelerClientIds") ?? [];

  function toggleParticipant(travelerClientId) {
    const nextParticipants = participantTravelerClientIds.includes(travelerClientId)
      ? participantTravelerClientIds.filter((clientId) => clientId !== travelerClientId)
      : [...participantTravelerClientIds, travelerClientId];
    setValue("participantTravelerClientIds", nextParticipants, { shouldDirty: true, shouldValidate: true });
  }

  function handleExpenseSave(formValues) {
    const parsedAmount = parseMoneyValue(`${formValues.currency} ${formValues.amountInput}`, formValues.currency);
    onSave({
      ...expense,
      ...formValues,
      title: formValues.title.trim(),
      amountMinor: parsedAmount?.amountMinor ?? expense.amountMinor,
      currency: parsedAmount?.currency ?? formValues.currency,
      notes: formValues.notes?.trim() ?? ""
    });
  }
  const formError = errors.title?.message || errors.amountInput?.message || errors.paidByTravelerClientId?.message || errors.participantTravelerClientIds?.message;

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog editor-dialog expense-dialog" role="dialog" aria-modal="true" aria-label={mode === "edit" ? "Edit expense" : "Add expense"}>
        <DialogHeader title={mode === "edit" ? "Edit expense" : "Add expense"} onClose={onCancel} />
        <form className="expense-form" onSubmit={submitExpenseForm(handleExpenseSave)}>
          <label className="editor-field editor-field-title">
            Title
            <input {...register("title")} placeholder="TeamLab tickets, train cards, dinner..." />
          </label>

          <div className="expense-form-grid">
            <label className="editor-field">
              Amount
              <input {...register("amountInput")} inputMode="decimal" placeholder="6400" />
            </label>
            <label className="editor-field">
              Currency
              <select {...register("currency")}>
                {SUPPORTED_CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}
              </select>
            </label>
            <label className="editor-field">
              Paid by
              <select {...register("paidByTravelerClientId")}>
                {travelers.map((traveler) => (
                  <option value={traveler.clientId} key={traveler.clientId}>{traveler.name}</option>
                ))}
              </select>
            </label>
            <label className="editor-field">
              Date
              <input {...register("expenseDate")} type="date" />
            </label>
          </div>

          <fieldset className="expense-participants">
            <legend>Split between</legend>
            <div>
              {travelers.map((traveler) => (
                <label key={traveler.clientId}>
                  <input
                    type="checkbox"
                    checked={participantTravelerClientIds.includes(traveler.clientId)}
                    onChange={() => toggleParticipant(traveler.clientId)}
                  />
                  <span>{traveler.name}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="editor-field editor-field-notes">
            Notes
            <textarea {...register("notes")} placeholder="Reservation number, who reimbursed outside the app, or anything useful..." />
          </label>

          {formError ? <p className="expense-form-error">{formError}</p> : null}

          <div className={`dialog-actions expense-dialog-actions${onDelete ? "" : " is-single-action"}`}>
            {isDeleteConfirming ? (
              <div className="expense-delete-confirmation" role="alert">
                <p>Delete “{expense.title || "this expense"}”? This cannot be undone.</p>
                <button className="ghost-button" type="button" onClick={() => setIsDeleteConfirming(false)}>Cancel</button>
                <button className="primary-button danger-button" type="button" onClick={onDelete}>
                  <Trash2 size={17} />
                  Delete expense
                </button>
              </div>
            ) : onDelete ? (
              <button className="ghost-button danger" type="button" onClick={() => setIsDeleteConfirming(true)}>
                <Trash2 size={17} />
                Delete
              </button>
            ) : null}
            {!isDeleteConfirming ? (
              <>
                <button className="primary-button" type="submit" disabled={!isDirty || !isValid}>
                  Save
                </button>
              </>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}


export default ExpenseModal;
