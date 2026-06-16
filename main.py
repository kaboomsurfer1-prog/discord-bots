import os
import io
import aiohttp
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
REACTION_TITLE = os.getenv("REACTION_TITLE", "✅ Reaction Role")
REACTION_TEXT = os.getenv(
    "REACTION_TEXT",
    "Premi ✅ sotto questo messaggio per ricevere il ruolo."
)

intents = discord.Intents.default()
intents.members = True
intents.reactions = True
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)


def font(size: int, bold: bool = False):
    paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()


def circle_crop(img: Image.Image, size: int) -> Image.Image:
    img = img.convert("RGBA").resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def centered_text(draw, xy, text, fnt, fill):
    x, y = xy
    box = draw.textbbox((0, 0), text, font=fnt)
    tw = box[2] - box[0]
    draw.text((x - tw // 2, y), text, font=fnt, fill=fill)


async def create_welcome_card(member: discord.Member) -> discord.File:
    base = Image.open("assets/background.png").convert("RGBA").resize((1000, 360))
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)

    # Border and dark glass
    d.rounded_rectangle((18, 18, 982, 342), radius=28, fill=(0, 0, 0, 82), outline=(255, 255, 255, 70), width=2)
    d.rounded_rectangle((30, 30, 970, 330), radius=24, outline=(20, 110, 255, 110), width=2)
    d.rounded_rectangle((38, 38, 962, 322), radius=22, outline=(255, 30, 30, 80), width=1)

    # Avatar
    avatar_asset = member.display_avatar.replace(size=256, static_format="png")
    avatar_bytes = await avatar_asset.read()
    avatar = Image.open(io.BytesIO(avatar_bytes)).convert("RGBA")
    avatar = circle_crop(avatar, 150)

    # Avatar glow
    glow = Image.new("RGBA", base.size, (0,0,0,0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((425, 28, 575, 178), fill=(255, 0, 0, 100))
    gd.ellipse((418, 28, 568, 178), outline=(0, 120, 255, 255), width=8)
    gd.ellipse((432, 28, 582, 178), outline=(255, 20, 20, 255), width=8)
    glow = glow.filter(ImageFilter.GaussianBlur(5))
    base.alpha_composite(glow)
    base.alpha_composite(avatar, (425, 28))

    # Avatar border
    d.ellipse((421, 24, 579, 182), outline=(245, 245, 245, 255), width=4)
    d.arc((421, 24, 579, 182), start=90, end=270, fill=(0, 120, 255, 255), width=7)
    d.arc((421, 24, 579, 182), start=270, end=90, fill=(255, 40, 40, 255), width=7)

    base.alpha_composite(overlay)
    d = ImageDraw.Draw(base)

    name = member.display_name
    if len(name) > 20:
        name = name[:17] + "..."

    centered_text(d, (500, 190), "BINE AI VENIT", font(30, True), (235, 235, 245, 255))
    centered_text(d, (500, 225), f"@{name}", font(52, True), (255, 60, 50, 255))
    centered_text(d, (500, 286), SERVER_NAME, font(38, True), (55, 145, 255, 255))
    centered_text(d, (500, 326), f"Member #{member.guild.member_count}", font(24, False), (225, 225, 225, 235))

    # Small info/footer
    d.text((58, 292), "DISCORD.GG/LEGACYCLT", font=font(18, True), fill=(240, 240, 245, 220))
    d.text((760, 292), "LEGACY OF CLT", font=font(18, True), fill=(240, 240, 245, 220))

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
        content=f"Salut {member.mention}, bine ai venit pe **{SERVER_NAME}**! Nu uita să citești regulile serverului!",
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
        await member.add_roles(role, reason="Reaction role")


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
        await member.remove_roles(role, reason="Reaction role removed")


@bot.tree.command(name="reaction_setup", description="Crea il messaggio per il reaction role.")
@commands.has_permissions(administrator=True)
async def reaction_setup(interaction: discord.Interaction):
    channel = interaction.guild.get_channel(REACTION_CHANNEL_ID)
    if not channel:
        await interaction.response.send_message("Canale reaction role non trovato.", ephemeral=True)
        return

    embed = discord.Embed(
        title=REACTION_TITLE,
        description=REACTION_TEXT,
        color=discord.Color.from_rgb(40, 100, 255)
    )
    embed.set_footer(text="Legacy of CLT • Reaction Role")

    msg = await channel.send(embed=embed)
    await msg.add_reaction(REACTION_EMOJI)

    await interaction.response.send_message(
        f"Messaggio creato: `{msg.id}`\nCopialo in Railway come `REACTION_MESSAGE_ID`.",
        ephemeral=True
    )


@bot.command(name="reaction_setup")
@commands.has_permissions(administrator=True)
async def reaction_setup_prefix(ctx):
    channel = ctx.guild.get_channel(REACTION_CHANNEL_ID)
    if not channel:
        await ctx.reply("Canale reaction role non trovato.")
        return

    embed = discord.Embed(
        title=REACTION_TITLE,
        description=REACTION_TEXT,
        color=discord.Color.from_rgb(40, 100, 255)
    )
    embed.set_footer(text="Legacy of CLT • Reaction Role")

    msg = await channel.send(embed=embed)
    await msg.add_reaction(REACTION_EMOJI)
    await ctx.reply(f"Messaggio creato. ID da mettere in Railway: `{msg.id}`")


if not TOKEN:
    raise RuntimeError("Manca DISCORD_TOKEN nelle variabili ambiente.")

bot.run(TOKEN)
