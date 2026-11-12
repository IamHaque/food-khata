import * as React from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { GuestCard } from "../primitives";
import { useSetupStatus } from "../api";
import { Login } from "./Login";
import { Register } from "./Register";

export function Welcome() {
  const setupStatus = useSetupStatus();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = React.useState<"login" | "register">(
    tabParam === "register" ? "register" : "login",
  );

  React.useEffect(() => {
    if (tabParam === "register" && activeTab !== "register") {
      setActiveTab("register");
    } else if (tabParam === "login" && activeTab !== "login") {
      setActiveTab("login");
    }
  }, [tabParam, activeTab]);

  // If first run (no owner yet), redirect to setup
  if (setupStatus.data && setupStatus.data.has_owner === false) {
    return <Navigate to="/setup" replace />;
  }

  const handleTabChange = (tab: "login" | "register") => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    });
  };

  return (
    <GuestCard
      title="Welcome to Food Khata"
      subtitle="Track and understand your food orders across delivery platforms."
    >
      <div className="space-y-4">
        {/* Accessible tab list */}
        <div
          role="tablist"
          aria-label="Access options"
          className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-center text-sm font-medium"
        >
          <button
            type="button"
            role="tab"
            id="tab-login"
            aria-selected={activeTab === "login"}
            aria-controls="panel-login"
            tabIndex={activeTab === "login" ? 0 : -1}
            onClick={() => handleTabChange("login")}
            className={`rounded-md py-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
              activeTab === "login"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            role="tab"
            id="tab-register"
            aria-selected={activeTab === "register"}
            aria-controls="panel-register"
            tabIndex={activeTab === "register" ? 0 : -1}
            onClick={() => handleTabChange("register")}
            className={`rounded-md py-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
              activeTab === "register"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Register
          </button>
        </div>

        {/* Tab panels */}
        <div
          role="tabpanel"
          id="panel-login"
          aria-labelledby="tab-login"
          hidden={activeTab !== "login"}
        >
          {activeTab === "login" && <Login hideShell />}
        </div>

        <div
          role="tabpanel"
          id="panel-register"
          aria-labelledby="tab-register"
          hidden={activeTab !== "register"}
        >
          {activeTab === "register" && <Register hideShell />}
        </div>
      </div>
    </GuestCard>
  );
}

export default Welcome;
