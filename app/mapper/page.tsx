import type { Metadata } from "next";
import Mapper from "./Mapper";
import "./mapper.css";

export const metadata: Metadata = {
  title: "Policy checker · Regulatory Radar",
  description:
    "Compare policy requirements and existing controls using a local AI model.",
};

export default function MapperPage() {
  return <Mapper />;
}
