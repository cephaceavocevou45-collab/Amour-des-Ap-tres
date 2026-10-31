export async function readProfilePhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choisissez une image JPG, PNG ou WebP.');
  }
  if (file.size > 5 * 1024 * 1024) throw new Error('La photo ne peut pas dépasser 5 Mo.');
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('La photo n’a pas pu être lue.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onerror = () => reject(new Error('Le fichier choisi n’est pas une image valide.'));
    element.onload = () => resolve(element);
    element.src = source;
  });
  const scale = Math.min(1, 600 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('La photo n’a pas pu être préparée.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.78, 0.62, 0.48, 0.35]) {
    const result = canvas.toDataURL('image/jpeg', quality);
    if (result.length <= 78_000) return result;
  }
  throw new Error('Cette photo ne peut pas être réduite suffisamment. Choisissez une photo plus simple.');
}
