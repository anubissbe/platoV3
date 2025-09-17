#!/usr/bin/env node

// Test if /login command would work
async function testLogin() {
  try {
    console.log("Testing login functionality...");
    const { loginCopilot } = await import("./dist/providers/copilot.js");
    console.log("loginCopilot function imported successfully");
    console.log("Function type:", typeof loginCopilot);

    // Don't actually run it, just verify it exists
    if (typeof loginCopilot === "function") {
      console.log("✅ Login function is available and can be called");
    } else {
      console.log("❌ Login function is not a function");
    }
  } catch (error) {
    console.error("❌ Error importing login function:", error.message);
  }
}

testLogin();
