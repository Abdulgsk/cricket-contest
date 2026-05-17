// This file is automatically loaded by Next.js on server startup
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("\n" + "=".repeat(80));
    console.log("🔧 ENVIRONMENT VARIABLES LOG");
    console.log("=".repeat(80));
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Node Environment: ${process.env.NODE_ENV}`);
    console.log("=".repeat(80) + "\n");

    // Log all environment variables with full values (no masking)
    const envVars = Object.keys(process.env).sort();

    envVars.forEach((key) => {
      const value = process.env[key];
      console.log(`${key}=${value}`);
    });

    console.log("\n" + "=".repeat(80));
    console.log("✅ Environment variables logged successfully");
    console.log("=".repeat(80) + "\n");
  }
}
