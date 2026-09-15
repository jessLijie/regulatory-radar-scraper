import { createRoot } from "react-dom/client";
import Mapper from "../app/mapper/Mapper";
import RegulatoryDesk from "./RegulatoryDesk";
import RadarChat from "./RadarChat";
import "./radar.css";

createRoot(document.getElementById("root")!).render(window.location.pathname === "/mapper" ? <Mapper /> : window.location.pathname === "/chat" ? <RadarChat standalone publication={null} parentBusy={false} /> : <RegulatoryDesk />);
