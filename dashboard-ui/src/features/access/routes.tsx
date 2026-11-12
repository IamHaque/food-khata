import * as React from "react";
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { RedirectIfAuthed } from "./auth";

function RouteSkeleton() {
  return <div className="space-y-3 p-4" aria-busy="true" />;
}

const Welcome = lazy(() => import("./welcome/Welcome"));
const Setup = lazy(() => import("./welcome/Setup"));
const Login = lazy(() => import("./welcome/Login"));
const Register = lazy(() => import("./welcome/Register"));

/** Signed-out pages only. Every signed-in page lives in the app shell (app/App.tsx). */
export const PUBLIC_PATHS = ["/welcome", "/setup", "/login", "/register"];

export const AuthedPages = {
  Home: lazy(() => import("./accounts/Home")),
  LinkAccount: lazy(() => import("./accounts/LinkAccount")),
  Sync: lazy(() => import("./sync/Sync")),
  Jobs: lazy(() => import("./sync/Jobs")),
  Settings: lazy(() => import("./account/Settings")),
  Password: lazy(() => import("./account/Password")),
};

export function AccessRoutes() {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <Routes>
        <Route path="/welcome" element={<RedirectIfAuthed><Welcome /></RedirectIfAuthed>} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
        <Route path="/register" element={<RedirectIfAuthed><Register /></RedirectIfAuthed>} />
      </Routes>
    </Suspense>
  );
}

export default AccessRoutes;
