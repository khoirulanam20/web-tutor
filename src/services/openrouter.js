const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;

/**
 * Mendapatkan deskripsi langkah dari gambar menggunakan OpenRouter (Qwen/Qwen2.5-VL-72B-Instruct)
 * @param {string} base64Image - Gambar dalam format base64
 * @returns {Promise<string>} Deskripsi singkat langkah
 */
export const getStepDescriptionFromOpenRouter = async (base64Image) => {
    if (!API_KEY) {
        console.error("VITE_OPENROUTER_API_KEY tidak ditemukan di .env");
        alert("API Key OpenRouter belum disetel di .env");
        return "";
    }

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": window.location.origin, // Required by OpenRouter
                "X-Title": "Tutorial Builder", // Optional
            },
            body: JSON.stringify({
                "model": "google/gemma-3-27b-it:free",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "Lihat gambar screenshot aplikasi ini. User telah menambahkan anotasi berupa lingkaran merah, panah, atau highlight kuning. Berikan deskripsi singkat dalam 1 kalimat bahasa Indonesia tentang aksi yang ditunjukkan oleh anotasi tersebut untuk sebuah tutorial (misal: 'Klik tombol Simpan untuk menyimpan data'). Balas hanya dengan kalimat deskripsinya saja."
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": base64Image
                                }
                            }
                        ]
                    }
                ]
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error("OpenRouter Error:", data.error);
            return "";
        }

        return data.choices[0]?.message?.content?.trim() || "";
    } catch (error) {
        console.error("Gagal mendapatkan deskripsi OpenRouter:", error);
        return "";
    }
};
