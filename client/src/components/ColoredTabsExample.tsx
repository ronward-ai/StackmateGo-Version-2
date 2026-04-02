
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function ColoredTabsExample() {
  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Color-Coded Tab Variants</CardTitle>
        <CardDescription>
          Each tab type has a unique color theme when active:
          Primary blue for Timer, Green for Players, Orange for Tables, Info blue for Settings, and Purple for League
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="timer" className="w-full">
          <TabsList className="tabs-list grid w-full grid-cols-5 p-1">
            <TabsTrigger value="timer" variant="timer" className="tab-timer">
              <span className="material-icons text-sm mr-1">timer</span>
              Timer
            </TabsTrigger>
            <TabsTrigger value="players" variant="players" className="tab-players">
              <span className="material-icons text-sm mr-1">people</span>
              Players
            </TabsTrigger>
            <TabsTrigger value="tables" variant="tables" className="tab-tables">
              <span className="material-icons text-sm mr-1">table_restaurant</span>
              Tables
            </TabsTrigger>
            <TabsTrigger value="settings" variant="settings" className="tab-settings">
              <span className="material-icons text-sm mr-1">settings</span>
              Settings
            </TabsTrigger>
            <TabsTrigger value="league" variant="league" className="tab-league">
              <span className="material-icons text-sm mr-1">emoji_events</span>
              League
            </TabsTrigger>
          </TabsList>
          
          <div className="mt-6 p-4 rounded-lg bg-muted/30">
            <TabsContent value="timer" className="space-y-2">
              <h3 className="text-lg font-semibold text-primary">Timer Management</h3>
              <p>Control tournament timing and blind levels with primary blue theme.</p>
            </TabsContent>
            <TabsContent value="players" className="space-y-2">
              <h3 className="text-lg font-semibold text-success">Player Management</h3>
              <p>Manage player registrations and seating with success green theme.</p>
            </TabsContent>
            <TabsContent value="tables" className="space-y-2">
              <h3 className="text-lg font-semibold text-warning">Table Configuration</h3>
              <p>Set up and manage poker tables with warning orange theme.</p>
            </TabsContent>
            <TabsContent value="settings" className="space-y-2">
              <h3 className="text-lg font-semibold text-info">Settings & Configuration</h3>
              <p>Configure tournament settings and preferences with info blue theme.</p>
            </TabsContent>
            <TabsContent value="league" className="space-y-2">
              <h3 className="text-lg font-semibold" style={{color: "hsl(280 65% 65%)"}}>League & Rankings</h3>
              <p>View league standings and statistics with distinctive purple theme.</p>
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  )
}
