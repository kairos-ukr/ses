import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export const exportPdf = async () => {

  const element = document.getElementById("a4-preview");

  const canvas = await html2canvas(element, {
    scale: 3,
    useCORS: true
  });

  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF("p", "pt", "a4");

  pdf.addImage(imgData, "PNG", 0, 0, 595, 842);

  pdf.save("Kairos_Commercial_Offer.pdf");
};