import { routeTo } from '../../state/routes';
import { Button } from '../../ui/Button';

/** Primary "Route" button of every place card: opens the planner with this point as destination. */
export function RouteButton({ title, subtitle, lng, lat }: { title: string; subtitle?: string; lng: number; lat: number }) {
  return (
    <Button variant="primary" icon="route" block class="route-btn" onClick={() => routeTo({ title, subtitle, lng, lat })}>
      Route
    </Button>
  );
}
