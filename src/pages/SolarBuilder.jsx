import { useState } from "react";
import ControlPanel from "../components/ControlPanel";
import PreviewA4 from "../components/PreviewA4";
import { useSolarCalculations } from "../hooks/useSolarCalculations";
import { exportPdf } from "../utils/exportPdf";

const SolarBuilder = () => {

  const [inputs, setInputs] = useState({
    power: 15,
    priceUSD: 15000,
    monthlyConsumption: 800,
    tariff: 4.32,
    usdRate: 38
  });

  const calculations = useSolarCalculations(inputs);

  const handleChange = (field, value) => {
    if (value < 0) return;
    setInputs(prev => ({
      ...prev,
      [field]: Number(value)
    }));
  };

  const handleExport = async () => {
    await exportPdf();
  };

  return (
    <div className="flex gap-8 p-6">

      <ControlPanel
        inputs={inputs}
        onChange={handleChange}
        onExport={handleExport}
      />

      <PreviewA4
        inputs={inputs}
        calculations={calculations}
      />

    </div>
  );
};

export default SolarBuilder;