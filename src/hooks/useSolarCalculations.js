import { MONTHLY_GEN_PER_KW } from "../constants/solarConstants";

export const useSolarCalculations = ({
  power,
  priceUSD,
  monthlyConsumption,
  tariff,
  usdRate
}) => {

  const monthlyGeneration = MONTHLY_GEN_PER_KW.map(
    value => value * power
  );

  const totalGeneration = monthlyGeneration.reduce(
    (sum, value) => sum + value,
    0
  );

  const monthlySelfConsumption = monthlyGeneration.map(gen =>
    Math.min(gen, monthlyConsumption)
  );

  const totalSelfConsumption = monthlySelfConsumption.reduce(
    (sum, value) => sum + value,
    0
  );

  const surplus = totalGeneration - totalSelfConsumption;

  const selfConsumptionPercent = totalGeneration > 0
    ? (totalSelfConsumption / totalGeneration) * 100
    : 0;

  const yearlySavingsUAH = totalSelfConsumption * tariff;

  const yearlySavingsUSD = usdRate > 0
    ? yearlySavingsUAH / usdRate
    : 0;

  const paybackYears =
    yearlySavingsUSD > 0
      ? (priceUSD / yearlySavingsUSD).toFixed(1)
      : null;

  const accumulatedSavings = (years) =>
    yearlySavingsUAH * years;

  return {
    monthlyGeneration,
    totalGeneration,
    totalSelfConsumption,
    surplus,
    selfConsumptionPercent,
    yearlySavingsUAH,
    yearlySavingsUSD,
    paybackYears,
    accumulatedSavings
  };
};