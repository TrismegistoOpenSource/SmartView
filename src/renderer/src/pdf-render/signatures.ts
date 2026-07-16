/**
 * Object URL delle immagini di firma, per imageId. Vivono per l'intera sessione
 * (una firma può essere riusata su più pagine/documenti); il main tiene i byte
 * per il salvataggio, qui teniamo solo l'URL per la visualizzazione.
 */
interface SignatureImage {
  url: string
  width: number
  height: number
}

const images = new Map<string, SignatureImage>()

export function setSignatureImage(imageId: string, image: SignatureImage): void {
  images.set(imageId, image)
}

export function getSignatureImage(imageId: string): SignatureImage | undefined {
  return images.get(imageId)
}
