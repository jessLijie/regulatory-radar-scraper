import type { Metadata } from "next";
import Mapper from "./Mapper";
import "./mapper.css";

export const metadata: Metadata = {
  title: "Control Match Lab · Regulatory Radar",
  description: "An interactive policy-to-control mapping and auditor review prototype.",
};

export default function MapperPage() { return <Mapper />; }
