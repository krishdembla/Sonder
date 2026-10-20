export default function ProtectedTestPage() {
  return (
    <main className="p-8">
      <h1 className="text-xl font-medium">Protected test route</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You can see this page only when signed in.
      </p>
    </main>
  )
}
