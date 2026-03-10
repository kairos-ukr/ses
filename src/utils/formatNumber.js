export const formatNumber = (value) => {
  if (!value && value !== 0) return "—";
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};