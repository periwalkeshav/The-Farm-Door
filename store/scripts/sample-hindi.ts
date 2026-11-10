/**
 * Hindi text for the SAMPLE catalogue in seed.ts (made-up products, like the
 * English). Replace it with your own wording from Admin > Products > Hindi
 * version when you add real products. The categories' Hindi names are in
 * categories.ts. `npm run db:seed -- --update` fills this in on an existing
 * demo database where the Hindi is still empty.
 */

type ProductHindi = { name: string; subtitle: string; description: string; ingredients: string; usage: string; storage?: string };

const OIL_STORAGE_HI = "ढक्कन बंद करके ठंडी, अँधेरी जगह पर रखें, सीधी धूप से दूर।";

export const STORAGE_HI = "एयरटाइट डिब्बे में, धूप से दूर ठंडी और सूखी जगह पर रखें। सूखे चम्मच का इस्तेमाल करें।";

export const PRODUCTS_HI: Record<string, ProductHindi> = {
  "turmeric-powder": {
    name: "हल्दी पाउडर",
    subtitle: "पिसी हल्दी",
    description: "रोज़ के खाने के लिए पिसी हल्दी: दाल, सब्ज़ी, चावल और गरम हल्दी वाला दूध। थोड़ी-सी हल्दी से ही अच्छा रंग और हल्का, मिट्टी जैसा स्वाद आ जाता है।",
    ingredients: "हल्दी",
    usage: "पकाने की शुरुआत में गरम तेल या घी में ¼–½ छोटा चम्मच डालें, या उबलती दाल में मिलाएँ।",
  },
  "red-chilli-powder": {
    name: "लाल मिर्च पाउडर",
    subtitle: "अपना तीखापन चुनें",
    description: "दो तीखेपन में पिसी लाल मिर्च। कम तीखी मिर्च रंग और हल्की गर्माहट देती है; तीखी उनके लिए है जिन्हें करी और चटनी में असली तीखापन पसंद है।",
    ingredients: "लाल मिर्च",
    usage: "तड़के, मैरिनेड, करी और चटनी में डालें। थोड़े से शुरू करें और स्वाद के हिसाब से बढ़ाएँ।",
  },
  cumin: {
    name: "जीरा",
    subtitle: "साबुत या पिसा हुआ",
    description: "तड़के और जीरा राइस के लिए साबुत जीरा, या रायते, छाछ और मसाला रब के लिए पिसा जीरा।",
    ingredients: "जीरा",
    usage: "साबुत: प्याज़ डालने से पहले गरम तेल में चटकाएँ। पिसा: रायते, छाछ या चाट पर छिड़कें।",
  },
  "coriander-powder": {
    name: "धनिया पाउडर",
    subtitle: "पिसा धनिया",
    description: "हल्की, नींबू जैसी ताज़गी वाला पिसा धनिया, ज़्यादातर उत्तर भारतीय करी की जान।",
    ingredients: "धनिया के बीज",
    usage: "प्याज़ और टमाटर पक जाने के बाद बाक़ी पिसे मसालों के साथ डालें।",
  },
  "garam-masala": {
    name: "गरम मसाला",
    subtitle: "पाउच या काँच का जार",
    description: "भुने और पिसे साबुत मसालों का गर्माहट भरा मिश्रण। करी, बिरयानी और दाल को आख़िर में एक चुटकी से ख़ुशबूदार बनाएँ।",
    ingredients: "धनिया, जीरा, काली मिर्च, दालचीनी, इलायची, लौंग, तेज पत्ता, जायफल (नमूना सूची, अपनी रेसिपी के लिए पक्का करें)",
    usage: "पकाने के आख़िर में एक चुटकी डालें, या बने हुए खाने पर छिड़कें।",
  },
  "black-pepper": {
    name: "काली मिर्च",
    subtitle: "साबुत या पिसी हुई",
    description: "तेज़, चटपटी काली मिर्च। ग्राइंडर के लिए साबुत दाने लें या ताज़ी पिसी हुई।",
    ingredients: "काली मिर्च",
    usage: "अंडे, सलाद और सूप पर ताज़ा पीसकर डालें, या चावल और ग्रेवी में साबुत डालें।",
  },
  "green-cardamom": {
    name: "हरी इलायची",
    subtitle: "साबुत फली",
    description: "चाय, खीर, बिरयानी और मिठाइयों के लिए ख़ुशबूदार हरी इलायची।",
    ingredients: "हरी इलायची",
    usage: "2–3 इलायची हल्का कूटकर चाय या चावल में डालें। मिठाई के लिए दाने पीस लें।",
  },
  "cinnamon-sticks": {
    name: "दालचीनी",
    subtitle: "साबुत",
    description: "पुलाव, बिरयानी, मसाला चाय और बेकिंग के लिए साबुत दालचीनी।",
    ingredients: "दालचीनी",
    usage: "बाक़ी साबुत मसालों के साथ गरम तेल में एक टुकड़ा डालें, या चाय में उबालें।",
  },
  "star-anise": {
    name: "चक्र फूल",
    subtitle: "साबुत",
    description: "मीठी, मुलेठी जैसी ख़ुशबू वाला साबुत चक्र फूल, बिरयानी और धीमी आँच पर पकी ग्रेवी के लिए।",
    ingredients: "चक्र फूल",
    usage: "पकाते समय एक या दो फूल साबुत डालें; परोसने से पहले निकाल दें।",
  },
  "bay-leaves": {
    name: "तेज पत्ता",
    subtitle: "साबुत",
    description: "चावल, दाल और ग्रेवी के लिए सूखे भारतीय तेज पत्ते।",
    ingredients: "तेज पत्ता",
    usage: "पकाने की शुरुआत में गरम तेल में 1–2 पत्ते डालें; परोसने से पहले निकाल दें।",
  },
  "sambar-masala": {
    name: "सांबर मसाला",
    subtitle: "दक्षिण भारतीय मसाला",
    description: "सांबर और सब्ज़ियों की करी के लिए खट्टा-ख़ुशबूदार मसाला।",
    ingredients: "धनिया, लाल मिर्च, चना दाल, तूर दाल, जीरा, मेथी, काली मिर्च, करी पत्ता, हींग (नमूना सूची, अपनी रेसिपी के लिए पक्का करें)",
    usage: "इमली के साथ उबलती दाल और सब्ज़ियों में 1–2 बड़े चम्मच डालें।",
  },
  "cold-pressed-mustard-oil": {
    name: "कोल्ड-प्रेस्ड सरसों का तेल",
    subtitle: "कच्ची घानी · बोतल या टिन",
    description: "तीखी खुशबू वाला सुनहरा सरसों का तेल, अचार, मछली की करी और उत्तर भारतीय तड़के के लिए।",
    ingredients: "सरसों का तेल",
    usage: "हल्का धुआँ उठने तक गरम करें, फिर मसाले डालने से पहले आँच धीमी करें।",
    storage: OIL_STORAGE_HI,
  },
  "cold-pressed-groundnut-oil": {
    name: "कोल्ड-प्रेस्ड मूंगफली का तेल",
    subtitle: "बोतल या टिन",
    description: "रोज़ तलने और दक्षिण भारतीय खाने के लिए हल्का, मूंगफली के स्वाद वाला तेल।",
    ingredients: "मूंगफली का तेल",
    usage: "तलने, तड़के और डोसे के लिए इस्तेमाल करें।",
    storage: OIL_STORAGE_HI,
  },
  "toor-dal": {
    name: "तूर दाल",
    subtitle: "अरहर दाल",
    description: "रोज़ की दाल और सांबर के लिए अरहर की दाल। पककर नरम और मलाईदार बनती है।",
    ingredients: "तूर दाल (अरहर)",
    usage: "धोकर 30 मिनट भिगोएँ, फिर हल्दी और नमक के साथ प्रेशर कुकर में पकाएँ।",
  },
  "moong-dal": {
    name: "मूंग दाल",
    subtitle: "पीली धुली मूंग",
    description: "खिचड़ी, दाल तड़का और हलवे के लिए जल्दी पकने वाली धुली मूंग।",
    ingredients: "धुली मूंग दाल",
    usage: "धोकर 15–20 मिनट पकाएँ, या प्रेशर कुकर में 2 सीटी लगाएँ।",
  },
  "basmati-rice": {
    name: "बासमती चावल",
    subtitle: "लंबे दाने",
    description: "बिरयानी और पुलाव के लिए लंबे, खुशबूदार दाने जो पककर खिले-खिले रहते हैं।",
    ingredients: "बासमती चावल",
    usage: "धोकर 20 मिनट भिगोएँ, और हर कप चावल में पौने दो कप पानी डालकर पकाएँ।",
  },
  "multiflora-honey": {
    name: "मल्टीफ्लोरा शहद",
    subtitle: "काँच का जार",
    description: "कई फूलों के रस से बना सुनहरा शहद। चाय में, टोस्ट पर या मिठाइयों में बढ़िया।",
    ingredients: "शहद",
    usage: "गुनगुने (उबलते नहीं) पेय में मिलाएँ, या नाश्ते पर डालें।",
    storage: "ढक्कन कसकर बंद रखें और कमरे के तापमान पर रखें। समय के साथ शहद जम सकता है; पिघलाने के लिए जार को गुनगुने पानी में रखें।",
  },
  almonds: {
    name: "बादाम",
    subtitle: "साबुत",
    description: "खाने, रात भर भिगोने और मिठाइयों के लिए कुरकुरे साबुत बादाम।",
    ingredients: "बादाम",
    usage: "मुट्ठी भर बादाम रात भर भिगोकर सुबह छीलें, या हल्का भूनकर खाएँ।",
  },
  cashews: {
    name: "काजू",
    subtitle: "साबुत",
    description: "खाने, गाढ़ी ग्रेवी और मिठाइयों के लिए मलाईदार साबुत काजू।",
    ingredients: "काजू",
    usage: "भिगोकर पीसें और गाढ़ी ग्रेवी बनाएँ, या चुटकी भर नमक के साथ भूनें।",
  },
  "jaggery-powder": {
    name: "गुड़ पाउडर",
    subtitle: "पिसा हुआ गुड़",
    description: "चाय, लड्डू और रोज़ की मिठास के लिए पिसा हुआ गुड़।",
    ingredients: "गुड़ (गन्ना)",
    usage: "चाय, मिठाइयों और चटनी में चीनी की जगह इस्तेमाल करें।",
  },
  "rock-salt": {
    name: "सेंधा नमक",
    subtitle: "पिसा हुआ",
    description: "व्रत, चाट और रायते के लिए सेंधा नमक।",
    ingredients: "सेंधा नमक",
    usage: "व्रत के खाने में साधारण नमक की जगह, या चाट और रायते पर छिड़कें।",
  },
};

export const COLLECTIONS_HI: Record<string, { nameHi: string; descriptionHi: string }> = {
  bestsellers: { nameHi: "सबसे ज़्यादा बिकने वाले", descriptionHi: "जिनसे सब पका रहे हैं।" },
  "new-arrivals": { nameHi: "नए आए", descriptionHi: "शेल्फ़ पर नई चीज़ें।" },
  "everyday-essentials": { nameHi: "रोज़ की ज़रूरत", descriptionHi: "रसोई की वो चीज़ें जो आप रोज़ उठाएँगे।" },
  biryani: { nameHi: "बिरयानी", descriptionHi: "ख़ुशबूदार बिरयानी के लिए साबुत मसाले और मसाला।" },
  "masala-chai": { nameHi: "मसाला चाय", descriptionHi: "गरमा-गरम चाय के लिए सब कुछ।" },
  "everyday-tadka": { nameHi: "रोज़ का तड़का", descriptionHi: "दाल और सब्ज़ी की बुनियादी चीज़ें।" },
  "south-indian": { nameHi: "दक्षिण भारतीय", descriptionHi: "सांबर, रसम और बहुत कुछ के लिए।" },
};

/** The product columns for a sample product's Hindi (empty strings if there is none). */
export function productHindiColumns(slug: string, hasOwnStorage: boolean) {
  const h = PRODUCTS_HI[slug];
  if (!h) return {};
  return { nameHi: h.name, subtitleHi: h.subtitle, descriptionHi: h.description, ingredientsHi: h.ingredients, usageInstructionsHi: h.usage, storageInstructionsHi: h.storage ?? (hasOwnStorage ? "" : STORAGE_HI) };
}
