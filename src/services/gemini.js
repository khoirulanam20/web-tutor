import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

/**
 * Mendapatkan deskripsi langkah dari gambar menggunakan Gemini-1.5-Flash
 * @param {string} base64Image - Gambar dalam format base64
 * @returns {Promise<string>} Deskripsi singkat langkah
 */
export const getStepDescriptionFromImage = async (base64Image) => {
    if (!API_KEY) {
        console.error("VITE_GEMINI_API_KEY tidak ditemukan di .env");
        return "";
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // Hapus prefix data:image/...;base64,
        const base64Data = base64Image.split(",")[1];

        const prompt = "Lihat gambar screenshot aplikasi ini. User telah menambahkan anotasi berupa lingkaran merah, panah, atau highlight kuning. Berikan deskripsi singkat dalam 1 kalimat bahasa Indonesia tentang aksi yang ditunjukkan oleh anotasi tersebut untuk sebuah tutorial (misal: 'Klik tombol Simpan untuk menyimpan data'). Balas hanya dengan kalimat deskripsinya saja.";

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Data,
                    mimeType: "image/jpeg",
                },
            },
        ]);

        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error("Gagal mendapatkan deskripsi AI:", error);
        return "";
    }
};
