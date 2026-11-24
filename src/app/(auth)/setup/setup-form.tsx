"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input, Button, Card } from "@/components/ui";
import { setupAction } from "../actions";
import { PROFILE_COLORS } from "@/lib/household-colors";

export function SetupForm() {
  const [count, setCount] = useState(2);
  return (
    <ActionForm action={setupAction} resetOnSuccess={false} className="space-y-5">
      <input type="hidden" name="count" value={count} />
      <Card className="grid gap-4 p-5 sm:grid-cols-[1fr_120px]">
        <Field label="Household name"><Input name="householdName" required placeholder="The Rivera home" /></Field>
        <Field label="Currency"><Input name="currency" defaultValue="USD" maxLength={3} className="uppercase" /></Field>
      </Card>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-medium">Person {i + 1}</p>
            <input type="hidden" name={`color${i}`} value={PROFILE_COLORS[i % PROFILE_COLORS.length]} />
            <span className="h-3 w-3 rounded-full" style={{ background: PROFILE_COLORS[i % PROFILE_COLORS.length] }} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name"><Input name={`name${i}`} required autoComplete="off" /></Field>
            <Field label="PIN (4–8 digits)"><Input name={`pin${i}`} type="password" inputMode="numeric" pattern="\d{4,8}" required autoComplete="new-password" /></Field>
            <Field label="Confirm PIN"><Input name={`pin${i}confirm`} type="password" inputMode="numeric" pattern="\d{4,8}" required autoComplete="new-password" /></Field>
          </div>
        </Card>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {count < 6 ? <Button type="button" variant="ghost" onClick={() => setCount(count + 1)}>Add person</Button> : null}
          {count > 1 ? <Button type="button" variant="ghost" onClick={() => setCount(count - 1)}>Remove last</Button> : null}
        </div>
        <SubmitButton size="lg" pendingText="Creating…">Create household</SubmitButton>
      </div>
      <p className="text-xs text-faint">PINs keep each person&apos;s private records private on a shared iPad. They are stored only as salted scrypt hashes.</p>
    </ActionForm>
  );
}
