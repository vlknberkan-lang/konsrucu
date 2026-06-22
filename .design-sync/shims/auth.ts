// design-sync render shim for @/app/actions/auth.
// GlobalHeader binds signOutAction to a <form action={...}>. The real module is
// a server action that imports cookies/Supabase — pulling it into the preview
// bundle would drag server-only code into the browser. This no-op stand-in lets
// the header render statically. NOT shipped to consumers.
export async function signOutAction(): Promise<void> {}
