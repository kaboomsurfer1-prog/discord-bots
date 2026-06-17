import os
import io
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
        "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
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


async def create_welcome_card(member: discord.Member) -> discord.File:
    width, height = 1200, 420

    bg = Image.open("assets/background.png").convert("RGBA").resize((width, height))
    bg = bg.filter(ImageFilter.GaussianBlur(1))
    bg.alpha_composite(Image.new("RGBA", (width, height), (8, 10, 20, 110)))

    base = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    base.alpha_composite(bg)
    d = ImageDraw.Draw(base, "RGBA")

    # clean main panel
    d.rounded_rectangle((45, 38, width - 45, height - 38), radius=28,
                        fill=(8, 10, 18, 105), outline=(255, 255, 255, 60), width=2)

    # top accent
    d.rounded_rectangle((70, 58, width - 70, 66), radius=4, fill=(55, 150, 255, 215))
    d.rounded_rectangle((width - 290, 58, width - 70, 66), radius=4, fill=(255, 65, 65, 215))

    # avatar
    avatar_asset = member.display_avatar.replace(size=512, static_format="png")
    avatar_bytes = await avatar_asset.read()
    avatar = Image.open(io.BytesIO(avatar_bytes)).convert("RGBA")
    avatar_size = 170
    avatar = circle_crop(avatar, avatar_size)

    avatar_x, avatar_y = 82, 122

    glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow, "RGBA")
    gd.ellipse((avatar_x - 10, avatar_y - 10, avatar_x + avatar_size + 10, avatar_y + avatar_size + 10),
               fill=(60, 135, 255, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(10))
    base.alpha_composite(glow)
    base.alpha_composite(avatar, (avatar_x, avatar_y))

    d = ImageDraw.Draw(base, "RGBA")
    d.ellipse((avatar_x - 6, avatar_y - 6, avatar_x + avatar_size + 6, avatar_y + avatar_size + 6),
              outline=(255, 255, 255, 235), width=4)
    d.arc((avatar_x - 10, avatar_y - 10, avatar_x + avatar_size + 10, avatar_y + avatar_size + 10),
          start=90, end=270, fill=(55, 150, 255, 255), width=6)
    d.arc((avatar_x - 10, avatar_y - 10, avatar_x + avatar_size + 10, avatar_y + avatar_size + 10),
          start=270, end=90, fill=(255, 65, 65, 255), width=6)

    # separator
    d.line((290, 98, 290, height - 94), fill=(255, 255, 255, 40), width=2)

    # TEXTS MUCH BIGGER
    name = member.display_name
    if len(name) > 24:
        name = name[:21] + "..."

    text_x = 345
    max_width = 760

    small_font = font(30, True)
    title_font = font(72, True)
    name_font = fit_font(d, f"@{name}", max_width, 76, 40, True)
    server_font = fit_font(d, SERVER_NAME, max_width, 56, 32, True)
    member_font = font(34, True)
    footer_font = font(24, True)

    draw_shadow(d, (text_x, 88), "WELCOME TO", small_font, (190, 198, 210, 255), offset=2)
    draw_shadow(d, (text_x, 120), "BINE AI VENIT", title_font, (255, 255, 255, 255), offset=4)
    draw_shadow(d, (text_x, 205), f"@{name}", name_font, (255, 78, 68, 255), offset=4)
    draw_shadow(d, (text_x, 285), SERVER_NAME, server_font, (78, 170, 255, 255), offset=4)
    draw_shadow(d, (text_x, 336), f"Member #{member.guild.member_count}", member_font, (235, 235, 240, 255), offset=3)

    # footer
    d.line((75, height - 76, width - 75, height - 76), fill=(255, 255, 255, 40), width=1)
    draw_shadow(d, (80, height - 60), "discord.gg/legacyofclt", footer_font, (245, 245, 250, 245), offset=2)

    right_text = "LEGACY OF CLT"
    bbox = d.textbbox((0, 0), right_text, font=footer_font)
    tw = bbox[2] - bbox[0]
    draw_shadow(d, (width - 80 - tw, height - 60), right_text, footer_font, (245, 245, 250, 245), offset=2)

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
