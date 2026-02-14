import { Route, Switch } from "wouter";
import { Layout } from "./components/Layout";
import { Overview } from "./pages/Overview";
import { Memory } from "./pages/Memory";
import { Heartbeat } from "./pages/Heartbeat";
import { Chat } from "./pages/Chat";
import { Skills } from "./pages/Skills";

export function App() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Overview} />
        <Route path="/memory" component={Memory} />
        <Route path="/heartbeat" component={Heartbeat} />
        <Route path="/chat" component={Chat} />
        <Route path="/skills" component={Skills} />
        <Route>
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Page not found</p>
          </div>
        </Route>
      </Switch>
    </Layout>
  );
}
