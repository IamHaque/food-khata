import * as React from "react";
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth";

function RouteSkeleton() {
  return <div className="space-y-3 p-4" aria-busy="true" />;
}

const Welcome = lazy(() => import("./welcome/Welcome"));
const Setup = lazy(() => import("./welcome/Setup"));
const Login = lazy(() => import("./welcome/Login"));
const Register = lazy(() => import("./welcome/Register"));

const Home = lazy(() => import("./accounts/Home"));
const Accounts = lazy(() => import("./accounts/Home"));
const LinkAccount = lazy(() => import("./accounts/LinkAccount"));
const Sync = lazy(() => import("./sync/Sync"));
const Settings = lazy(() => import("./owner"));

export function AccessRoutes() {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <Routes>
        <Route path="/home" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/accounts" element={<RequireAuth><Accounts /></RequireAuth>} />
        <Route path="/accounts/link" element={<RequireAuth><LinkAccount /></RequireAuth>} />
        <Route path="/sync" element={<RequireAuth><Sync /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
      </Routes>
    </Suspense>
  );
}

export default AccessRoutes;
