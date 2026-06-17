import os
import io
from pathlib import Path
import discord
from discord.ext import commands
from PIL import Image, ImageDraw, ImageFont, ImageFilter

TOKEN = os.getenv("DISCORD_TOKEN")

WELCOME_CHANNEL_ID = int(os.getenv("WELCOME_CHANNEL_ID", "1505903653779931280"))
REACTION_CHANNEL_ID = int(os.getenv("REACTION_CHANNEL_ID", "1516572771302379721"))
REACTION_MESSAGE_ID = int(os.getenv("REACTION_MESSAGE_ID", "0"))
REACTION_ROLE_ID = int(os.getenv("REACTION_ROLE_ID", "1505912122926694550"))
REACTION_EMOJI = os.getenv("REACTION_EMOJI", "✅")

SERVER_NAME = os.getenv("SERVER_NAME", "LEGACY OF CLT")
ASSET_DIR = Path(__file__).resolve().parent / "assets"

ALLOWED_SETUP_ROLE_IDS = [
    1505906085901504522,
    1505905849774641243,
]

REACTION_TITLE = os.getenv("REACTION_TITLE", "📜 Verificare & Regulament")
REACTION_TEXT = os.getenv(
    "REACTION_TEXT",
    """Bun venit pe serverul LEGACY OF CLT!

Înainte de a primi acces la toate canalele, te rugăm să citești regulamentul și să îl respecți.

✅ Respectă toți membrii comunității.
✅ Este interzis limbajul ofensator, rasist sau discriminatoriu.
✅ Nu face spam și nu abuza de canale.
✅ Respectă deciziile staff-ului.
✅ Folosește canalele conform destinației lor.
✅ Orice încălcare a regulamentului poate duce la sancțiuni.

Dacă ai citit și ai înțeles regulamentul serverului, apasă pe reacția ✅ de mai jos pentru a primi acces complet.

Îți dorim distracție plăcută pe LEGACY OF CLT!"""
)

intents = discord.Intents.default()
intents.members = True
intents.reactions = True
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)


def has_setup_permission(member: discord.Member) -> bool:
    return any(role.id in ALLOWED_SETUP_ROLE_IDS for role in member.roles)


def font(size: int, bold: bool = False):
    paths = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def circle_crop(img, size: int):
    img = img.convert("RGBA").resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def fit_font(draw, text, max_width, start_size, min_size=26, bold=True):
    size = start_size
    while size >= min_size:
        f = font(size, bold)
        box = draw.textbbox((0, 0), text, font=f)
        if box[2] - box[0] <= max_width:
            return f
        size -= 2
    return font(min_size, bold)


def draw_shadow(draw, xy, text, fnt, fill, offset=4, shadow=(0, 0, 0, 220)):
    x, y = xy
    draw.text((x + offset, y + offset), text, font=fnt, fill=shadow)
    draw.text((x, y), text, font=fnt, fill=fill)


def draw_glow_text(base, xy, text, fnt, fill, glow, blur=8, stroke_width=1):
    glow_layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_layer, "RGBA")
    glow_draw.text(xy, text, font=fnt, fill=glow)
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(blur))
    base.alpha_composite(glow_layer)

    draw = ImageDraw.Draw(base, "RGBA")
    draw.text(
        xy,
        text,
        font=fnt,
        fill=fill,
        stroke_width=stroke_width,
        stroke_fill=(4, 7, 15, 230),
    )


def draw_gradient_bar(base, xy, size, radius, left, right):
    w, h = size
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    layer_draw = ImageDraw.Draw(layer, "RGBA")

    for x in range(w):
        amount = x / max(w - 1, 1)
        color = tuple(int(left[i] + (right[i] - left[i]) * amount) for i in range(4))
        layer_draw.line((x, 0, x, h), fill=color)

    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)
    layer.putalpha(mask)
    base.alpha_composite(layer, xy)


def draw_pill(draw, x, y, text, fnt, fill, text_fill, outline=(255, 255, 255, 35), pad_x=18, height=44):
    bbox = draw.textbbox((0, 0), text, font=fnt)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    width = tw + pad_x * 2

    draw.rounded_rectangle(
        (x, y, x + width, y + height),
        radius=height // 2,
        fill=fill,
        outline=outline,
        width=1,
    )
    draw.text((x + pad_x, y + (height - th) / 2 - bbox[1]), text, font=fnt, fill=text_fill)
    return x + width


async def create_welcome_card(member: discord.Member) -> discord.File:
    width, height = 1200, 420

    bg = Image.open(ASSET_DIR / "background.png").convert("RGBA").resize((width, height), Image.LANCZOS)
    bg = bg.filter(ImageFilter.GaussianBlur(2))

    base = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    base.alpha_composite(bg)
    base.alpha_composite(Image.new("RGBA", (width, height), (4, 7, 16, 165)))

    color_wash = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    wash_draw = ImageDraw.Draw(color_wash, "RGBA")
    wash_draw.rectangle((0, 0, width // 2, height), fill=(35, 135, 255, 45))
    wash_draw.rectangle((width // 2, 0, width, height), fill=(255, 45, 60, 40))
    color_wash = color_wash.filter(ImageFilter.GaussianBlur(70))
    base.alpha_composite(color_wash)

    try:
        logo = Image.open(ASSET_DIR / "logo.png").convert("RGBA")
        logo.thumbnail((430, 430), Image.LANCZOS)
        alpha = logo.getchannel("A").point(lambda value: int(value * 0.12))
        logo.putalpha(alpha)
        base.alpha_composite(logo, (width - 465, -5))
    except Exception:
        pass

    d = ImageDraw.Draw(base, "RGBA")

    # clean main panel
    d.rounded_rectangle(
        (45, 38, width - 45, height - 38),
        radius=30,
        fill=(6, 9, 18, 178),
        outline=(255, 255, 255, 70),
        width=2,
    )

    # top accent
    draw_gradient_bar(
        base,
        (70, 58),
        (width - 140, 8),
        4,
        (65, 160, 255, 255),
        (255, 70, 82, 255),
    )

    # avatar
    avatar_asset = member.display_avatar.replace(size=512, static_format="png")
    avatar_bytes = await avatar_asset.read()
    avatar = Image.open(io.BytesIO(avatar_bytes)).convert("RGBA")
    avatar_size = 220
    avatar = circle_crop(avatar, avatar_size)

    avatar_x, avatar_y = 83, 101

    avatar_shadow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(avatar_shadow, "RGBA")
    shadow_draw.ellipse(
        (avatar_x - 18, avatar_y - 12, avatar_x + avatar_size + 18, avatar_y + avatar_size + 24),
        fill=(0, 0, 0, 165),
    )
    avatar_shadow = avatar_shadow.filter(ImageFilter.GaussianBlur(18))
    base.alpha_composite(avatar_shadow)

    ring = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    ring_draw = ImageDraw.Draw(ring, "RGBA")
    ring_draw.ellipse(
        (avatar_x - 18, avatar_y - 18, avatar_x + avatar_size + 18, avatar_y + avatar_size + 18),
        fill=(255, 255, 255, 20),
    )
    ring_draw.ellipse(
        (avatar_x - 12, avatar_y - 12, avatar_x + avatar_size + 12, avatar_y + avatar_size + 12),
        outline=(255, 255, 255, 225),
        width=5,
    )
    ring_draw.arc(
        (avatar_x - 18, avatar_y - 18, avatar_x + avatar_size + 18, avatar_y + avatar_size + 18),
        start=90,
        end=270,
        fill=(65, 160, 255, 255),
        width=8,
    )
    ring_draw.arc(
        (avatar_x - 18, avatar_y - 18, avatar_x + avatar_size + 18, avatar_y + avatar_size + 18),
        start=270,
        end=90,
        fill=(255, 70, 82, 255),
        width=8,
    )
    ring = ring.filter(ImageFilter.GaussianBlur(0.2))
    base.alpha_composite(ring)
    base.alpha_composite(avatar, (avatar_x, avatar_y))

    d = ImageDraw.Draw(base, "RGBA")
    d.ellipse(
        (avatar_x - 8, avatar_y - 8, avatar_x + avatar_size + 8, avatar_y + avatar_size + 8),
        outline=(255, 255, 255, 230),
        width=4,
    )

    # separator
    d.line((340, 92, 340, height - 92), fill=(255, 255, 255, 45), width=2)

    # big, clean text hierarchy
    name = member.display_name
    if len(name) > 24:
        name = name[:21] + "..."

    text_x = 382
    max_width = 720

    small_font = font(28, True)
    title_font = fit_font(d, "BINE AI VENIT!", max_width, 84, 60, True)
    name_font = fit_font(d, f"@{name}", max_width, 66, 40, True)
    server_font = fit_font(d, SERVER_NAME, 420, 30, 22, True)
    member_font = font(27, True)
    footer_font = font(18, True)

    d.text((text_x, 89), "WELCOME TO", font=small_font, fill=(175, 190, 210, 255))
    draw_glow_text(
        base,
        (text_x, 121),
        "BINE AI VENIT!",
        title_font,
        (255, 255, 255, 255),
        (65, 160, 255, 95),
        blur=9,
        stroke_width=1,
    )
    draw_glow_text(
        base,
        (text_x, 216),
        f"@{name}",
        name_font,
        (255, 82, 86, 255),
        (255, 70, 82, 85),
        blur=8,
        stroke_width=1,
    )

    d = ImageDraw.Draw(base, "RGBA")
    member_count = getattr(getattr(member, "guild", None), "member_count", None)
    member_text = f"MEMBER #{member_count}" if member_count else "NEW MEMBER"
    pill_y = 292
    next_x = draw_pill(
        d,
        text_x,
        pill_y,
        SERVER_NAME,
        server_font,
        (65, 160, 255, 32),
        (215, 235, 255, 255),
        outline=(65, 160, 255, 75),
        height=42,
    )
    draw_pill(
        d,
        next_x + 16,
        pill_y,
        member_text,
        member_font,
        (255, 70, 82, 28),
        (255, 226, 228, 255),
        outline=(255, 70, 82, 70),
        height=42,
    )

    # footer
    d.line((75, height - 72, width - 75, height - 72), fill=(255, 255, 255, 32), width=1)
    draw_shadow(d, (80, height - 66), "discord.gg/legacyofclt", footer_font, (235, 240, 248, 235), offset=2)

    footer_right = "LEGACY OF CLT"
    bbox = d.textbbox((0, 0), footer_right, font=footer_font)
    tw = bbox[2] - bbox[0]
    draw_shadow(d, (width - 80 - tw, height - 66), footer_right, footer_font, (235, 240, 248, 235), offset=2)

    buf = io.BytesIO()
    base.save(buf, "PNG")
    buf.seek(0)
    return discord.File(buf, filename="welcome.png")


@bot.event
async def on_ready():
    print(f"Bot online come {bot.user} | Server: {len(bot.guilds)}")
    try:
        await bot.tree.sync()
        print("Slash commands sincronizzati.")
    except Exception as e:
        print(f"Sync slash commands errore: {e}")


@bot.event
async def on_member_join(member: discord.Member):
    channel = member.guild.get_channel(WELCOME_CHANNEL_ID)
    if not channel:
        return

    card = await create_welcome_card(member)
    await channel.send(
        content=f"Salut {member.mention}, bine ai venit pe **{SERVER_NAME}**! Nu uita să citești regulamentul serverului.",
        file=card
    )


@bot.event
async def on_raw_reaction_add(payload: discord.RawReactionActionEvent):
    if payload.member is None or payload.member.bot:
        return
    if payload.channel_id != REACTION_CHANNEL_ID:
        return
    if REACTION_MESSAGE_ID and payload.message_id != REACTION_MESSAGE_ID:
        return
    if str(payload.emoji) != REACTION_EMOJI:
        return

    guild = bot.get_guild(payload.guild_id)
    if not guild:
        return

    role = guild.get_role(REACTION_ROLE_ID)
    member = guild.get_member(payload.user_id)

    if role and member:
        try:
            await member.add_roles(role, reason="Reaction role")
            print(f"Rol adăugat: {role.name} -> {member}")
        except discord.Forbidden:
            print("Eroare: botul nu are permisiunea Manage Roles sau rolul este prea sus.")
        except Exception as e:
            print(f"Eroare la adăugarea rolului: {e}")


@bot.event
async def on_raw_reaction_remove(payload: discord.RawReactionActionEvent):
    if payload.channel_id != REACTION_CHANNEL_ID:
        return
    if REACTION_MESSAGE_ID and payload.message_id != REACTION_MESSAGE_ID:
        return
    if str(payload.emoji) != REACTION_EMOJI:
        return

    guild = bot.get_guild(payload.guild_id)
    if not guild:
        return

    role = guild.get_role(REACTION_ROLE_ID)
    member = guild.get_member(payload.user_id)

    if role and member:
        try:
            await member.remove_roles(role, reason="Reaction role removed")
            print(f"Rol eliminat: {role.name} -> {member}")
        except discord.Forbidden:
            print("Eroare: botul nu are permisiunea Manage Roles sau rolul este prea sus.")
        except Exception as e:
            print(f"Eroare la eliminarea rolului: {e}")


@bot.tree.command(name="reaction_setup", description="Creează mesajul pentru verificare și regulament.")
async def reaction_setup(interaction: discord.Interaction):
    if not isinstance(interaction.user, discord.Member) or not has_setup_permission(interaction.user):
        await interaction.response.send_message(
            "❌ Nu ai permisiunea să folosești această comandă.",
            ephemeral=True
        )
        return

    channel = interaction.guild.get_channel(REACTION_CHANNEL_ID)
    if not channel:
        await interaction.response.send_message("❌ Canalul pentru reaction role nu a fost găsit.", ephemeral=True)
        return

    embed = discord.Embed(
        title=REACTION_TITLE,
        description=REACTION_TEXT,
        color=discord.Color.from_rgb(40, 100, 255)
    )
    if interaction.guild.icon:
        embed.set_thumbnail(url=interaction.guild.icon.url)
    embed.set_footer(text="LEGACY OF CLT • Verification System")

    msg = await channel.send(embed=embed)
    await msg.add_reaction(REACTION_EMOJI)

    await interaction.response.send_message(
        f"✅ Mesajul de verificare a fost creat.\n"
        f"ID mesaj: `{msg.id}`\n\n"
        f"Copiază acest ID în Railway la variabila `REACTION_MESSAGE_ID`, apoi fă Redeploy.",
        ephemeral=True
    )


@bot.command(name="reaction_setup")
async def reaction_setup_prefix(ctx):
    if not has_setup_permission(ctx.author):
        await ctx.reply("❌ Nu ai permisiunea să folosești această comandă.")
        return

    channel = ctx.guild.get_channel(REACTION_CHANNEL_ID)
    if not channel:
        await ctx.reply("❌ Canalul pentru reaction role nu a fost găsit.")
        return

    embed = discord.Embed(
        title=REACTION_TITLE,
        description=REACTION_TEXT,
        color=discord.Color.from_rgb(40, 100, 255)
    )
    if ctx.guild.icon:
        embed.set_thumbnail(url=ctx.guild.icon.url)
    embed.set_footer(text="LEGACY OF CLT • Verification System")

    msg = await channel.send(embed=embed)
    await msg.add_reaction(REACTION_EMOJI)

    await ctx.reply(
        f"✅ Mesajul de verificare a fost creat.\n"
        f"ID mesaj: `{msg.id}`\n\n"
        f"Copiază acest ID în Railway la variabila `REACTION_MESSAGE_ID`, poi fai Redeploy."
    )


@bot.tree.command(name="testwelcome", description="Testează imaginea welcome.")
async def testwelcome(interaction: discord.Interaction):
    if not isinstance(interaction.user, discord.Member) or not has_setup_permission(interaction.user):
        await interaction.response.send_message(
            "❌ Nu ai permisiunea să folosești această comandă.",
            ephemeral=True
        )
        return

    card = await create_welcome_card(interaction.user)
    await interaction.response.send_message(
        content=f"✅ Preview welcome pentru {interaction.user.mention}",
        file=card,
        ephemeral=True
    )


@bot.command(name="testwelcome")
async def testwelcome_prefix(ctx):
    if not has_setup_permission(ctx.author):
        await ctx.reply("❌ Nu ai permisiunea să folosești această comandă.")
        return

    card = await create_welcome_card(ctx.author)
    await ctx.reply(
        content=f"✅ Preview welcome pentru {ctx.author.mention}",
        file=card
    )


if not TOKEN:
    raise RuntimeError("Manca DISCORD_TOKEN nelle variabili ambiente.")

bot.run(TOKEN)
import os
import io
from pathlib import Path
import discord
from discord.ext import commands
from PIL import Image, ImageDraw, ImageFont, ImageFilter

TOKEN = os.getenv("DISCORD_TOKEN")

WELCOME_CHANNEL_ID = int(os.getenv("WELCOME_CHANNEL_ID", "1505903653779931280"))
REACTION_CHANNEL_ID = int(os.getenv("REACTION_CHANNEL_ID", "1516572771302379721"))
REACTION_MESSAGE_ID = int(os.getenv("REACTION_MESSAGE_ID", "0"))
REACTION_ROLE_ID = int(os.getenv("REACTION_ROLE_ID", "1505912122926694550"))
REACTION_EMOJI = os.getenv("REACTION_EMOJI", "✅")

SERVER_NAME = os.getenv("SERVER_NAME", "LEGACY OF CLT")
ASSET_DIR = Path(__file__).resolve().parent / "assets"

ALLOWED_SETUP_ROLE_IDS = [
    1505906085901504522,
    1505905849774641243,
]

REACTION_TITLE = os.getenv("REACTION_TITLE", "📜 Verificare & Regulament")
REACTION_TEXT = os.getenv(
    "REACTION_TEXT",
    """Bun venit pe serverul LEGACY OF CLT!

Înainte de a primi acces la toate canalele, te rugăm să citești regulamentul și să îl respecți.

✅ Respectă toți membrii comunității.
✅ Este interzis limbajul ofensator, rasist sau discriminatoriu.
✅ Nu face spam și nu abuza de canale.
✅ Respectă deciziile staff-ului.
✅ Folosește canalele conform destinației lor.
✅ Orice încălcare a regulamentului poate duce la sancțiuni.

Dacă ai citit și ai înțeles regulamentul serverului, apasă pe reacția ✅ de mai jos pentru a primi acces complet.

Îți dorim distracție plăcută pe LEGACY OF CLT!"""
)

intents = discord.Intents.default()
intents.members = True
intents.reactions = True
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)


def has_setup_permission(member: discord.Member) -> bool:
    return any(role.id in ALLOWED_SETUP_ROLE_IDS for role in member.roles)


def font(size: int, bold: bool = False):
    paths = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def circle_crop(img, size: int):
    img = img.convert("RGBA").resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def fit_font(draw, text, max_width, start_size, min_size=26, bold=True):
    size = start_size
    while size >= min_size:
        f = font(size, bold)
        box = draw.textbbox((0, 0), text, font=f)
        if box[2] - box[0] <= max_width:
            return f
        size -= 2
    return font(min_size, bold)


def draw_shadow(draw, xy, text, fnt, fill, offset=4, shadow=(0, 0, 0, 220)):
    x, y = xy
    draw.text((x + offset, y + offset), text, font=fnt, fill=shadow)
    draw.text((x, y), text, font=fnt, fill=fill)


def draw_glow_text(base, xy, text, fnt, fill, glow, blur=8, stroke_width=1):
    glow_layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_layer, "RGBA")
    glow_draw.text(xy, text, font=fnt, fill=glow)
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(blur))
    base.alpha_composite(glow_layer)

    draw = ImageDraw.Draw(base, "RGBA")
    draw.text(
        xy,
        text,
        font=fnt,
        fill=fill,
        stroke_width=stroke_width,
        stroke_fill=(4, 7, 15, 230),
    )


def draw_gradient_bar(base, xy, size, radius, left, right):
    w, h = size
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    layer_draw = ImageDraw.Draw(layer, "RGBA")

    for x in range(w):
        amount = x / max(w - 1, 1)
        color = tuple(int(left[i] + (right[i] - left[i]) * amount) for i in range(4))
        layer_draw.line((x, 0, x, h), fill=color)

    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)
    layer.putalpha(mask)
    base.alpha_composite(layer, xy)


def draw_pill(draw, x, y, text, fnt, fill, text_fill, outline=(255, 255, 255, 35), pad_x=18, height=44):
    bbox = draw.textbbox((0, 0), text, font=fnt)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    width = tw + pad_x * 2

    draw.rounded_rectangle(
        (x, y, x + width, y + height),
        radius=height // 2,
        fill=fill,
        outline=outline,
        width=1,
    )
    draw.text((x + pad_x, y + (height - th) / 2 - bbox[1]), text, font=fnt, fill=text_fill)
    return x + width


async def create_welcome_card(member: discord.Member) -> discord.File:
    width, height = 1200, 420

    bg = Image.open(ASSET_DIR / "background.png").convert("RGBA").resize((width, height), Image.LANCZOS)
    bg = bg.filter(ImageFilter.GaussianBlur(2))

    base = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    base.alpha_composite(bg)
    base.alpha_composite(Image.new("RGBA", (width, height), (4, 7, 16, 165)))

    color_wash = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    wash_draw = ImageDraw.Draw(color_wash, "RGBA")
    wash_draw.rectangle((0, 0, width // 2, height), fill=(35, 135, 255, 45))
    wash_draw.rectangle((width // 2, 0, width, height), fill=(255, 45, 60, 40))
    color_wash = color_wash.filter(ImageFilter.GaussianBlur(70))
    base.alpha_composite(color_wash)

    try:
        logo = Image.open(ASSET_DIR / "logo.png").convert("RGBA")
        logo.thumbnail((430, 430), Image.LANCZOS)
        alpha = logo.getchannel("A").point(lambda value: int(value * 0.12))
        logo.putalpha(alpha)
        base.alpha_composite(logo, (width - 465, -5))
    except Exception:
        pass

    d = ImageDraw.Draw(base, "RGBA")

    # clean main panel
    d.rounded_rectangle(
        (45, 38, width - 45, height - 38),
        radius=30,
        fill=(6, 9, 18, 178),
        outline=(255, 255, 255, 70),
        width=2,
    )

    # top accent
    draw_gradient_bar(
        base,
        (70, 58),
        (width - 140, 8),
        4,
        (65, 160, 255, 255),
        (255, 70, 82, 255),
    )

    # avatar
    avatar_asset = member.display_avatar.replace(size=512, static_format="png")
    avatar_bytes = await avatar_asset.read()
    avatar = Image.open(io.BytesIO(avatar_bytes)).convert("RGBA")
    avatar_size = 220
    avatar = circle_crop(avatar, avatar_size)

    avatar_x, avatar_y = 83, 101

    avatar_shadow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(avatar_shadow, "RGBA")
    shadow_draw.ellipse(
        (avatar_x - 18, avatar_y - 12, avatar_x + avatar_size + 18, avatar_y + avatar_size + 24),
        fill=(0, 0, 0, 165),
    )
    avatar_shadow = avatar_shadow.filter(ImageFilter.GaussianBlur(18))
    base.alpha_composite(avatar_shadow)

    ring = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    ring_draw = ImageDraw.Draw(ring, "RGBA")
    ring_draw.ellipse(
        (avatar_x - 18, avatar_y - 18, avatar_x + avatar_size + 18, avatar_y + avatar_size + 18),
        fill=(255, 255, 255, 20),
    )
    ring_draw.ellipse(
        (avatar_x - 12, avatar_y - 12, avatar_x + avatar_size + 12, avatar_y + avatar_size + 12),
        outline=(255, 255, 255, 225),
        width=5,
    )
    ring_draw.arc(
        (avatar_x - 18, avatar_y - 18, avatar_x + avatar_size + 18, avatar_y + avatar_size + 18),
        start=90,
        end=270,
        fill=(65, 160, 255, 255),
        width=8,
    )
    ring_draw.arc(
        (avatar_x - 18, avatar_y - 18, avatar_x + avatar_size + 18, avatar_y + avatar_size + 18),
        start=270,
        end=90,
        fill=(255, 70, 82, 255),
        width=8,
    )
    ring = ring.filter(ImageFilter.GaussianBlur(0.2))
    base.alpha_composite(ring)
    base.alpha_composite(avatar, (avatar_x, avatar_y))

    d = ImageDraw.Draw(base, "RGBA")
    d.ellipse(
        (avatar_x - 8, avatar_y - 8, avatar_x + avatar_size + 8, avatar_y + avatar_size + 8),
        outline=(255, 255, 255, 230),
        width=4,
    )

    # separator
    d.line((340, 92, 340, height - 92), fill=(255, 255, 255, 45), width=2)

    # big, clean text hierarchy
    name = member.display_name
    if len(name) > 24:
        name = name[:21] + "..."

    text_x = 382
    max_width = 720

    small_font = font(28, True)
    title_font = fit_font(d, "BINE AI VENIT!", max_width, 84, 60, True)
    name_font = fit_font(d, f"@{name}", max_width, 66, 40, True)
    server_font = fit_font(d, SERVER_NAME, 420, 30, 22, True)
    member_font = font(27, True)
    footer_font = font(18, True)

    d.text((text_x, 89), "WELCOME TO", font=small_font, fill=(175, 190, 210, 255))
    draw_glow_text(
        base,
        (text_x, 121),
        "BINE AI VENIT!",
        title_font,
        (255, 255, 255, 255),
        (65, 160, 255, 95),
        blur=9,
        stroke_width=1,
    )
    draw_glow_text(
        base,
        (text_x, 216),
        f"@{name}",
        name_font,
        (255, 82, 86, 255),
        (255, 70, 82, 85),
        blur=8,
        stroke_width=1,
    )

    d = ImageDraw.Draw(base, "RGBA")
    member_count = getattr(getattr(member, "guild", None), "member_count", None)
    member_text = f"MEMBER #{member_count}" if member_count else "NEW MEMBER"
    pill_y = 292
    next_x = draw_pill(
        d,
        text_x,
        pill_y,
        SERVER_NAME,
        server_font,
        (65, 160, 255, 32),
        (215, 235, 255, 255),
        outline=(65, 160, 255, 75),
        height=42,
    )
    draw_pill(
        d,
        next_x + 16,
        pill_y,
        member_text,
        member_font,
        (255, 70, 82, 28),
        (255, 226, 228, 255),
        outline=(255, 70, 82, 70),
        height=42,
    )

    # footer
    d.line((75, height - 72, width - 75, height - 72), fill=(255, 255, 255, 32), width=1)
    draw_shadow(d, (80, height - 66), "discord.gg/legacyofclt", footer_font, (235, 240, 248, 235), offset=2)

    footer_right = "LEGACY OF CLT"
    bbox = d.textbbox((0, 0), footer_right, font=footer_font)
    tw = bbox[2] - bbox[0]
    draw_shadow(d, (width - 80 - tw, height - 66), footer_right, footer_font, (235, 240, 248, 235), offset=2)

    buf = io.BytesIO()
    base.save(buf, "PNG")
    buf.seek(0)
    return discord.File(buf, filename="welcome.png")


@bot.event
async def on_ready():
    print(f"Bot online come {bot.user} | Server: {len(bot.guilds)}")
    try:
        await bot.tree.sync()
        print("Slash commands sincronizzati.")
    except Exception as e:
        print(f"Sync slash commands errore: {e}")


@bot.event
async def on_member_join(member: discord.Member):
    channel = member.guild.get_channel(WELCOME_CHANNEL_ID)
    if not channel:
        return

    card = await create_welcome_card(member)
    await channel.send(
        content=f"Salut {member.mention}, bine ai venit pe **{SERVER_NAME}**! Nu uita să citești regulamentul serverului.",
        file=card
    )


@bot.event
async def on_raw_reaction_add(payload: discord.RawReactionActionEvent):
    if payload.member is None or payload.member.bot:
        return
    if payload.channel_id != REACTION_CHANNEL_ID:
        return
    if REACTION_MESSAGE_ID and payload.message_id != REACTION_MESSAGE_ID:
        return
    if str(payload.emoji) != REACTION_EMOJI:
        return

    guild = bot.get_guild(payload.guild_id)
    if not guild:
        return

    role = guild.get_role(REACTION_ROLE_ID)
    member = guild.get_member(payload.user_id)

    if role and member:
        try:
            await member.add_roles(role, reason="Reaction role")
            print(f"Rol adăugat: {role.name} -> {member}")
        except discord.Forbidden:
            print("Eroare: botul nu are permisiunea Manage Roles sau rolul este prea sus.")
        except Exception as e:
            print(f"Eroare la adăugarea rolului: {e}")


@bot.event
async def on_raw_reaction_remove(payload: discord.RawReactionActionEvent):
    if payload.channel_id != REACTION_CHANNEL_ID:
        return
    if REACTION_MESSAGE_ID and payload.message_id != REACTION_MESSAGE_ID:
        return
    if str(payload.emoji) != REACTION_EMOJI:
        return

    guild = bot.get_guild(payload.guild_id)
    if not guild:
        return

    role = guild.get_role(REACTION_ROLE_ID)
    member = guild.get_member(payload.user_id)

    if role and member:
        try:
            await member.remove_roles(role, reason="Reaction role removed")
            print(f"Rol eliminat: {role.name} -> {member}")
        except discord.Forbidden:
            print("Eroare: botul nu are permisiunea Manage Roles sau rolul este prea sus.")
        except Exception as e:
            print(f"Eroare la eliminarea rolului: {e}")


@bot.tree.command(name="reaction_setup", description="Creează mesajul pentru verificare și regulament.")
async def reaction_setup(interaction: discord.Interaction):
    if not isinstance(interaction.user, discord.Member) or not has_setup_permission(interaction.user):
        await interaction.response.send_message(
            "❌ Nu ai permisiunea să folosești această comandă.",
            ephemeral=True
        )
        return

    channel = interaction.guild.get_channel(REACTION_CHANNEL_ID)
    if not channel:
        await interaction.response.send_message("❌ Canalul pentru reaction role nu a fost găsit.", ephemeral=True)
        return

    embed = discord.Embed(
        title=REACTION_TITLE,
        description=REACTION_TEXT,
        color=discord.Color.from_rgb(40, 100, 255)
    )
    if interaction.guild.icon:
        embed.set_thumbnail(url=interaction.guild.icon.url)
    embed.set_footer(text="LEGACY OF CLT • Verification System")

    msg = await channel.send(embed=embed)
    await msg.add_reaction(REACTION_EMOJI)

    await interaction.response.send_message(
        f"✅ Mesajul de verificare a fost creat.\n"
        f"ID mesaj: `{msg.id}`\n\n"
        f"Copiază acest ID în Railway la variabila `REACTION_MESSAGE_ID`, apoi fă Redeploy.",
        ephemeral=True
    )


@bot.command(name="reaction_setup")
async def reaction_setup_prefix(ctx):
    if not has_setup_permission(ctx.author):
        await ctx.reply("❌ Nu ai permisiunea să folosești această comandă.")
        return

    channel = ctx.guild.get_channel(REACTION_CHANNEL_ID)
    if not channel:
        await ctx.reply("❌ Canalul pentru reaction role nu a fost găsit.")
        return

    embed = discord.Embed(
        title=REACTION_TITLE,
        description=REACTION_TEXT,
        color=discord.Color.from_rgb(40, 100, 255)
    )
    if ctx.guild.icon:
        embed.set_thumbnail(url=ctx.guild.icon.url)
    embed.set_footer(text="LEGACY OF CLT • Verification System")

    msg = await channel.send(embed=embed)
    await msg.add_reaction(REACTION_EMOJI)

    await ctx.reply(
        f"✅ Mesajul de verificare a fost creat.\n"
        f"ID mesaj: `{msg.id}`\n\n"
        f"Copiază acest ID în Railway la variabila `REACTION_MESSAGE_ID`, poi fai Redeploy."
    )


@bot.tree.command(name="testwelcome", description="Testează imaginea welcome.")
async def testwelcome(interaction: discord.Interaction):
    if not isinstance(interaction.user, discord.Member) or not has_setup_permission(interaction.user):
        await interaction.response.send_message(
            "❌ Nu ai permisiunea să folosești această comandă.",
            ephemeral=True
        )
        return

    card = await create_welcome_card(interaction.user)
    await interaction.response.send_message(
        content=f"✅ Preview welcome pentru {interaction.user.mention}",
        file=card,
        ephemeral=True
    )


@bot.command(name="testwelcome")
async def testwelcome_prefix(ctx):
    if not has_setup_permission(ctx.author):
        await ctx.reply("❌ Nu ai permisiunea să folosești această comandă.")
        return

    card = await create_welcome_card(ctx.author)
    await ctx.reply(
        content=f"✅ Preview welcome pentru {ctx.author.mention}",
        file=card
    )


if not TOKEN:
    raise RuntimeError("Manca DISCORD_TOKEN nelle variabili ambiente.")

bot.run(TOKEN)
