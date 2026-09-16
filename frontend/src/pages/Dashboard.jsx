import { useReducedMotion } from 'framer-motion';
import './dashboard.css';
import AlertCenter from './dashboard/AlertCenter';
import CropOverview from './dashboard/CropOverview';
import DashboardHeader from './dashboard/DashboardHeader';
import MarketOverview from './dashboard/MarketOverview';
import PrimaryAction from './dashboard/PrimaryAction';
import QuickAccess from './dashboard/QuickAccess';
import SaathiCard from './dashboard/SaathiCard';
import SoilOverview from './dashboard/SoilOverview';
import TodaysActions from './dashboard/TodaysActions';
import useDashboardData from './dashboard/useDashboardData';

export default function Dashboard() {
  const reduce = useReducedMotion();
  const data = useDashboardData();

  return (
    <div className="dash">
      <DashboardHeader
        reduce={reduce}
        liveNode={data.liveNode}
        nodeCounts={data.nodeCounts}
      />
      <PrimaryAction reduce={reduce} />
      <div className="dash-board">
        <SoilOverview hasSoil={data.hasSoil} lastAnalysis={data.lastAnalysis} liveNode={data.liveNode} />
        <CropOverview crop={data.crop} />
      </div>
      <MarketOverview
        latest={data.latest}
        points={data.points}
        marketError={data.marketError}
        marketLoading={data.marketLoading}
      />
      <div className="dash-board dash-lower">
        <TodaysActions hasSoil={data.hasSoil} crop={data.crop} />
        <SaathiCard />
      </div>
      <AlertCenter
        historyError={data.historyError}
        nodesPack={data.nodesPack}
        latestAnomaly={data.latestAnomaly}
        nodeCounts={data.nodeCounts}
      />
      <QuickAccess />
    </div>
  );
}
