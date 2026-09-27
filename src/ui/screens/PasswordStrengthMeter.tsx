import { Password, passwordStrength, PasswordHealthPolicy, PasswordStrength } from "../../domain";

const STRENGTH_LABELS: Record<PasswordStrength, string> = {
  weak: "Weak",
  fair: "Fair",
  strong: "Strong",
};

const HEALTH_POLICY = new PasswordHealthPolicy();

interface PasswordStrengthMeterProps {
  password: string;
}

/** Weak/fair/strong indicator for a password being typed; nothing while it's empty. */
export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  if (password === "") {
    return null;
  }
  const strength = passwordStrength(new Password(password), HEALTH_POLICY);
  return (
    <div className={`password-strength ${strength}`} aria-live="polite">
      <span className="password-strength-dot" />
      {STRENGTH_LABELS[strength]}
    </div>
  );
}
