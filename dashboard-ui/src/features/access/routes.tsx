import * as React from "react";
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

function RouteSkeleton() {
  return <div className="space-y-3 p-4" aria-busy="true" />;
}

function Placeholder() {
  return <div className="p-8 text-center text-muted-foreground">Coming soon</div>;
}

const Welcome = lazy(() => import("./welcome/Welcome"));
const Setup = lazy(() => import("./welcome/Setup"));
const Login = lazy(() => import("./welcome/Login"));
const Register = lazy(() => import("./welcome/Register"));

const Home = lazy(() => Promise.resolve({ default: Placeholder }));
const Accounts = lazy(() => Promise.resolve({ default: Placeholder }));
const LinkAccount = lazy(() => Promise.resolve({ default: Placeholder }));
const Sync = lazy(() => Promise.resolve({ default: Placeholder }));
const Settings = lazy(() => Promise.resolve({ default: Placeholder }));

export function AccessRoutes() {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/accounts/link" element={<LinkAccount />} />
        <Route path="/sync" element={<Sync />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Suspense>
  );
}

export default AccessRoutes;
