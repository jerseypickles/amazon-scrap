"""
Amazon US categories focused on CONSUMABLE/REPLENISHABLE products.
These are products customers buy repeatedly — high lifetime value.
"""

AMAZON_US_CATEGORIES = [
    {
        "id": "household",
        "name": "Household & Cleaning",
        "node": "15342811",
        "repurchase_weeks": 4,
        "subcategories": [
            {"id": "hh-laundry", "name": "Laundry Detergent & Supplies", "node": "15342821", "repurchase_weeks": 4},
            {"id": "hh-cleaning", "name": "All-Purpose Cleaners", "node": "15342811", "repurchase_weeks": 6},
            {"id": "hh-dish", "name": "Dish Soap & Dishwasher", "node": "15342801", "repurchase_weeks": 4},
            {"id": "hh-trash", "name": "Trash Bags & Liners", "node": "15342861", "repurchase_weeks": 3},
            {"id": "hh-paper", "name": "Paper Towels & Tissues", "node": "15342851", "repurchase_weeks": 2},
            {"id": "hh-airfresh", "name": "Air Fresheners", "node": "3744271", "repurchase_weeks": 4},
            {"id": "hh-sponge", "name": "Sponges & Scrubbers", "node": "15342841", "repurchase_weeks": 4},
        ],
    },
    {
        "id": "beauty",
        "name": "Beauty & Personal Care",
        "node": "3760911",
        "repurchase_weeks": 6,
        "subcategories": [
            {"id": "bp-shampoo", "name": "Shampoo & Conditioner", "node": "11057241", "repurchase_weeks": 6},
            {"id": "bp-bodywash", "name": "Body Wash & Shower Gel", "node": "11056281", "repurchase_weeks": 4},
            {"id": "bp-skincare", "name": "Face Moisturizer & Serum", "node": "11060451", "repurchase_weeks": 8},
            {"id": "bp-deodorant", "name": "Deodorant & Antiperspirant", "node": "11056071", "repurchase_weeks": 6},
            {"id": "bp-sunscreen", "name": "Sunscreen & Sun Care", "node": "11056171", "repurchase_weeks": 8},
            {"id": "bp-lotion", "name": "Body Lotion & Cream", "node": "11056201", "repurchase_weeks": 6},
            {"id": "bp-handsoap", "name": "Hand Soap & Sanitizer", "node": "3760931", "repurchase_weeks": 3},
        ],
    },
    {
        "id": "oralcare",
        "name": "Oral Care",
        "node": "10079992011",
        "repurchase_weeks": 8,
        "subcategories": [
            {"id": "oc-toothpaste", "name": "Toothpaste", "node": "10079992011", "repurchase_weeks": 6},
            {"id": "oc-mouthwash", "name": "Mouthwash & Rinse", "node": "10079992011", "repurchase_weeks": 4},
            {"id": "oc-floss", "name": "Dental Floss & Picks", "node": "10079992011", "repurchase_weeks": 4},
            {"id": "oc-whitening", "name": "Teeth Whitening", "node": "10079992011", "repurchase_weeks": 8},
        ],
    },
    {
        "id": "vitamins",
        "name": "Vitamins & Supplements",
        "node": "3764441",
        "repurchase_weeks": 4,
        "subcategories": [
            {"id": "vit-multi", "name": "Multivitamins", "node": "3764441", "repurchase_weeks": 4},
            {"id": "vit-protein", "name": "Protein Powder & Shakes", "node": "6973663011", "repurchase_weeks": 3},
            {"id": "vit-probiotic", "name": "Probiotics & Digestive", "node": "3764441", "repurchase_weeks": 4},
            {"id": "vit-collagen", "name": "Collagen & Beauty Supplements", "node": "3764441", "repurchase_weeks": 4},
            {"id": "vit-omega", "name": "Fish Oil & Omega", "node": "3764441", "repurchase_weeks": 4},
            {"id": "vit-pre", "name": "Pre-Workout & Energy", "node": "6973663011", "repurchase_weeks": 3},
        ],
    },
    {
        "id": "grocery",
        "name": "Grocery & Pantry",
        "node": "16310101",
        "repurchase_weeks": 2,
        "subcategories": [
            {"id": "gr-coffee", "name": "Coffee & Coffee Pods", "node": "16318401", "repurchase_weeks": 2},
            {"id": "gr-tea", "name": "Tea & Herbal", "node": "16318401", "repurchase_weeks": 3},
            {"id": "gr-snacks", "name": "Snack Bars & Protein Bars", "node": "16322721", "repurchase_weeks": 2},
            {"id": "gr-spices", "name": "Spices & Seasonings", "node": "16310231", "repurchase_weeks": 8},
            {"id": "gr-sauces", "name": "Sauces & Condiments", "node": "16310231", "repurchase_weeks": 6},
            {"id": "gr-honey", "name": "Honey & Natural Sweeteners", "node": "16310231", "repurchase_weeks": 8},
            {"id": "gr-nuts", "name": "Nuts & Trail Mix", "node": "16322721", "repurchase_weeks": 2},
        ],
    },
    {
        "id": "baby",
        "name": "Baby Consumables",
        "node": "165796011",
        "repurchase_weeks": 2,
        "subcategories": [
            {"id": "bb-diapers", "name": "Diapers", "node": "166764011", "repurchase_weeks": 1},
            {"id": "bb-wipes", "name": "Baby Wipes", "node": "166764011", "repurchase_weeks": 2},
            {"id": "bb-formula", "name": "Baby Formula & Food", "node": "166777011", "repurchase_weeks": 2},
            {"id": "bb-lotion", "name": "Baby Lotion & Wash", "node": "166772011", "repurchase_weeks": 4},
            {"id": "bb-diaper-cream", "name": "Diaper Rash Cream", "node": "166764011", "repurchase_weeks": 4},
        ],
    },
    {
        "id": "pets",
        "name": "Pet Consumables",
        "node": "2619533011",
        "repurchase_weeks": 3,
        "subcategories": [
            {"id": "pt-dogfood", "name": "Dog Food & Kibble", "node": "2975312011", "repurchase_weeks": 3},
            {"id": "pt-dogtreats", "name": "Dog Treats & Chews", "node": "2975312011", "repurchase_weeks": 2},
            {"id": "pt-catfood", "name": "Cat Food & Litter", "node": "2975241011", "repurchase_weeks": 2},
            {"id": "pt-cattreats", "name": "Cat Treats", "node": "2975241011", "repurchase_weeks": 3},
            {"id": "pt-supplements", "name": "Pet Vitamins & Supplements", "node": "2619533011", "repurchase_weeks": 4},
            {"id": "pt-grooming", "name": "Pet Shampoo & Grooming", "node": "2619533011", "repurchase_weeks": 6},
        ],
    },
    {
        "id": "autocare",
        "name": "Auto Care Consumables",
        "node": "15718271",
        "repurchase_weeks": 8,
        "subcategories": [
            {"id": "ac-wash", "name": "Car Wash Soap", "node": "15718271", "repurchase_weeks": 8},
            {"id": "ac-wax", "name": "Car Wax & Polish", "node": "15718271", "repurchase_weeks": 12},
            {"id": "ac-interior", "name": "Interior Cleaner & Wipes", "node": "15718271", "repurchase_weeks": 6},
            {"id": "ac-freshener", "name": "Car Air Freshener", "node": "15718271", "repurchase_weeks": 4},
        ],
    },
    {
        "id": "wellness",
        "name": "Wellness & Essential Oils",
        "node": "3760911",
        "repurchase_weeks": 6,
        "subcategories": [
            {"id": "wl-essential", "name": "Essential Oils", "node": "3760911", "repurchase_weeks": 8},
            {"id": "wl-candles", "name": "Scented Candles", "node": "3734261", "repurchase_weeks": 4},
            {"id": "wl-diffuser", "name": "Diffuser Oils & Refills", "node": "3760911", "repurchase_weeks": 6},
            {"id": "wl-bath", "name": "Bath Bombs & Salts", "node": "11056281", "repurchase_weeks": 4},
            {"id": "wl-herbal", "name": "Herbal Tea & Wellness Drinks", "node": "16318401", "repurchase_weeks": 3},
        ],
    },
]


# Focused on high-repurchase consumable niches
POPULAR_NICHES = [
    # Household & Cleaning
    "laundry detergent",
    "dish soap",
    "all purpose cleaner",
    "trash bags",
    "paper towels",
    "air freshener",
    "fabric softener",
    "disinfectant wipes",
    # Beauty & Personal Care
    "body wash",
    "shampoo",
    "conditioner",
    "hand soap",
    "body lotion",
    "deodorant",
    "sunscreen",
    "face moisturizer",
    # Oral Care
    "toothpaste",
    "mouthwash",
    "teeth whitening strips",
    # Vitamins & Supplements
    "protein powder",
    "multivitamins",
    "collagen powder",
    "probiotics",
    "fish oil",
    "pre workout",
    "creatine",
    # Grocery
    "coffee pods",
    "green tea",
    "protein bars",
    "honey",
    "hot sauce",
    "spices seasoning",
    # Baby
    "baby wipes",
    "diapers",
    "diaper cream",
    "baby lotion",
    # Pets
    "dog treats",
    "cat treats",
    "dog food",
    "cat litter",
    "pet supplements",
    # Auto
    "car wash soap",
    "car air freshener",
    # Wellness
    "essential oils",
    "scented candles",
    "bath bombs",
]
