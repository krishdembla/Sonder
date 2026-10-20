import { SignUp } from "@clerk/nextjs"

export default function SignUpPage() {
  return (
    <main className="flex min-h-svh items-center justify-center">
      <SignUp />
    </main>
  )
}
