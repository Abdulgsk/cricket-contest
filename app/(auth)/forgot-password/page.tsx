export default function ForgotPasswordPage() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Forgot password?</h1>
      <p className="text-sm text-muted-foreground">
        This is a private 13-friend league with plain-text credentials. Please contact the
        super-admin (commissioner) directly to have your password reset.
      </p>
      <p className="text-sm text-muted-foreground">
        After signing in, you can change your password from{" "}
        <span className="text-foreground">Profile → Change password</span>.
      </p>
    </div>
  );
}
